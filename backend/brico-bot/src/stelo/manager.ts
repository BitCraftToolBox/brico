/**
 * manager.ts — the bot's Stelo step: one `step()` per tick that links wallets, executes pending
 * transfer intents, refunds, reclassifies overlaps, sweeps payouts and reconciles the escrow wallet.
 * Entitlement accounting never waits on this; with either connection down the step does nothing.
 */
import type {REST} from "@discordjs/rest";
import type {Identity} from "spacetimedb";
import type {BricoAppConnection} from "../app/connection.ts";
import type {EscrowCache} from "../app/escrow-cache.ts";
import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {steloEscrowDrift, steloUnknownTransfersTotal} from "../metrics.ts";

import {isPending} from "./books.ts";
import type {SteloConnection} from "./connection.ts";
import {createDirectTransfers, type DirectTransfers} from "./direct.ts";
import {createTransferExecutor} from "./executor.ts";
import {createFundingStatusSync, type FundingStatusSync} from "./funding-status.ts";
import {createFundingGate, type FundingGate} from "./funding.ts";
import {createInFlight} from "./inflight.ts";
import {createLinkProcessor} from "./links.ts";
import {createFundingNotifier} from "./notify.ts";
import {createPayoutPlanner} from "./payouts.ts";
import {findEscrowDrift, findUnknownEscrowTransfers} from "./reconcile.ts";
import type {SteloCache} from "./stelo-cache.ts";
import {createSteloWrites, type SteloWrites} from "./writes.ts";

export interface SteloManagerOptions {
    config: SteloConfig;
    app: BricoAppConnection;
    stelo: SteloConnection;
    escrow: EscrowCache;
    steloCache: SteloCache;
    playerAccounts(): ReadonlyMap<bigint, Identity>;
    /** A player's current name; used to say who unclaimed money was owed to. */
    playerName?(playerId: bigint): string | undefined;
    /** Where funding alerts are posted besides the in-site toast; absent when the Discord bot is not configured. */
    discord?: {rest: REST; frontendOrigin: string};
    log: Logger;
    writes?: SteloWrites;
    now?: () => number;
}

export interface SteloManager {
    /** The funding gate the bounty engine consults before assigning an escrowed bounty. */
    readonly funding: FundingGate;
    /** Keeps each escrowed-currency craft's funding-status row current. */
    readonly fundingStatus: FundingStatusSync;
    /** Wallet-to-wallet transfers for `/pay stelo`; sent by this step's executor. */
    readonly direct: DirectTransfers;
    /**
     * Runs the step. `hasEnded(craftId)` is true for a craft prism still knows but that is no longer
     * open (completed or removed); its escrow is closed so the unspent headroom is refunded.
     */
    step(hasEnded: (craftId: bigint) => boolean): void;
}

export function createSteloManager(options: SteloManagerOptions): SteloManager {
    const {config, app, escrow, steloCache} = options;
    const log = options.log.child("stelo");
    const now = options.now ?? Date.now;
    const writes = options.writes ?? createSteloWrites(app, config.refPrefix);
    const inFlight = createInFlight(log);

    const stelo = {
        get isLive() {
            return options.stelo.isLive;
        },
        account: steloCache.account,
        accountsByAddress: steloCache.accountsByAddress,
        membersOf: steloCache.membersOf,
        userByIdentity: steloCache.userByIdentity,
        ledger: steloCache.ledger,
        ledgerByName: steloCache.ledgerByName,
        searchAddress: options.stelo.searchAddress,
        searchAccounts: options.stelo.searchAccounts,
        lookupAccount: options.stelo.lookupAccount,
        transfers: steloCache.transfers,
        findPostedTransfer: steloCache.findPostedTransfer,
        balance: steloCache.balance,
        createTransfer: options.stelo.createTransfer,
    };

    const {playerName} = options;
    const notifier = createFundingNotifier({
        app, escrow, stelo, writes, discord: options.discord, log,
        names: playerName && {player: playerName, playerAccounts: options.playerAccounts},
    });
    const funding = createFundingGate({config, escrow, stelo, playerAccounts: options.playerAccounts, writes, log, now});
    const fundingStatus = createFundingStatusSync({escrow, writes, notifier, log});
    const executor = createTransferExecutor({log, stelo, writes, now});
    const links = createLinkProcessor({config, escrow, playerAccounts: options.playerAccounts, stelo, writes, log});
    const payouts = createPayoutPlanner({config, escrow, playerAccounts: options.playerAccounts, stelo, writes, log, now, notifier});

    const reportedUnknown = new Set<bigint>();
    const drifting = new Set<string>();
    let lastVersions = "";

    function reconcile(): void {
        const drifts = findEscrowDrift(config, escrow.state, steloCache);
        const now = new Set(drifts.map(d => d.currency));
        for (const drift of drifts) {
            if (!drifting.has(drift.currency)) {
                log.error("escrow wallet balance differs from the books; pausing outgoing transfers", {
                    currency: drift.currency, expected: drift.expected.toString(), actual: drift.actual.toString(),
                });
            }
            steloEscrowDrift.set({currency: drift.currency}, 1);
        }
        for (const currency of drifting) {
            if (!now.has(currency)) {
                log.info("escrow wallet balance matches the books again; resuming transfers", {currency});
                steloEscrowDrift.set({currency}, 0);
            }
        }
        drifting.clear();
        for (const currency of now) drifting.add(currency);
        executor.paused = drifting.size > 0;

        for (const transfer of findUnknownEscrowTransfers(config, escrow.state, steloCache)) {
            if (reportedUnknown.has(transfer.id)) continue;
            reportedUnknown.add(transfer.id);
            steloUnknownTransfersTotal.inc();
            // For an Asset transfer the receiver is the debited account.
            const incoming = Object.values(config.currencies).some(c => c.escrowAccountId === transfer.debitAccountId);
            log.warn(incoming
                ? "transfer into an escrow wallet has no matching intent; it is not in the books and can be returned manually"
                : "transfer out of an escrow wallet has no matching intent; it is not in the books and was not sent by this bot's current intents", {
                transfer: transfer.id.toString(), debitAccountId: transfer.debitAccountId.toString(),
                creditAccountId: transfer.creditAccountId.toString(), amount: transfer.postedAmount?.toString(), memo: transfer.memo,
            });
        }
    }

    /** Publishes each currency's unclaimed-money policy so the UI can state it; writes only what differs from the stored row. */
    function publishPolicies(): void {
        for (const [currency, {unclaimed}] of Object.entries(config.currencies)) {
            const rollTo = unclaimed.action === "rollover" ? unclaimed.to : undefined;
            const stored = escrow.state.policies.get(currency);
            if (stored?.action === unclaimed.action && stored.rollTo === rollTo && stored.afterDays === unclaimed.afterDays) continue;
            if (inFlight.has(`policy:${currency}`)) continue;
            inFlight.track(`policy:${currency}`, writes.setCurrencyPolicy(currency, unclaimed.action, rollTo, unclaimed.afterDays), "publish currency policy", {currency});
        }
    }

    return {
        funding,
        fundingStatus,
        direct: createDirectTransfers({config, escrow, playerAccounts: options.playerAccounts, stelo, writes}),

        step(hasEnded) {
            if (!app.isLive) return;
            for (const craftId of escrow.state.openEscrows.keys()) {
                if (!hasEnded(craftId) || inFlight.has(`close:${craftId}`)) continue;
                inFlight.track(`close:${craftId}`, writes.closeCraftEscrow(craftId), "close craft escrow", {craftId: craftId.toString()});
            }

            for (const craftId of escrow.state.fundingRows.keys()) if (hasEnded(craftId)) fundingStatus.clear(craftId);
            fundingStatus.flush();

            // Skip the (cheap but not free) passes when nothing moved and no time-based work can be due.
            const versions = `${escrow.version}:${steloCache.version}`;
            const changed = versions !== lastVersions;
            lastVersions = versions;

            publishPolicies();
            links.run();
            if (changed && options.stelo.isLive) reconcile();
            executor.run([...escrow.state.transfers.values()].filter(isPending));
            payouts.refunds();
            if (changed) payouts.overlaps();
            payouts.sweep();
            payouts.resume(changed);
        },
    };
}
