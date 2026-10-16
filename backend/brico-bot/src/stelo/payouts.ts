/**
 * payouts.ts — the money that leaves escrow: refunds of released headroom, reclassification of
 * overlapping payments, the interval payout sweep, and closing out money owed to payees who can't be
 * paid. Each step writes transfer intents or module reducers; the executor moves the money.
 */
import type {BountyEscrowPool, SteloTransfer} from "@brico/bindings/brico-app/types";
import {overlapRelease, splitPayout} from "@brico/crafts/entitlement";
import {Identity, Timestamp} from "spacetimedb";
import {type EscrowCache, poolKey, receivingKey} from "../app/escrow-cache.ts";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {isPending, reservableRefundDue, timestampMs, toSteloAmount} from "./books.ts";
import {createInFlight} from "./inflight.ts";
import {canFundFrom} from "./link-verify.ts";
import type {FundingNotifier} from "./notify.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {SteloWrites} from "./writes.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PayoutDeps {
    config: SteloConfig;
    escrow: EscrowCache;
    /** BitCraft player id -> brico account, from active `bitcraft-ea2` links. */
    playerAccounts(): ReadonlyMap<bigint, Identity>;
    stelo: SteloReadModel & {readonly isLive: boolean};
    writes: SteloWrites;
    log: Logger;
    now(): number;
    /** Raises payout-shortfall and unclaimed alerts; absent in tests. */
    notifier?: FundingNotifier;
}

export interface PayoutPlanner {
    /** Sends released headroom back to the wallets that funded it. */
    refunds(): void;
    /** Moves directly-paid units that have since become guaranteed over to escrow-paid. */
    overlaps(): void;
    /**
     * Once per interval, pulls each payee's loyalty extras from the paying wallet into escrow and pays
     * the guaranteed part plus the pulled extras in one transfer; closes out what can't be paid.
     */
    sweep(): void;
    /** Sends the payout of pools whose extras pull has finished. `changed` is whether any books moved since the last call. */
    resume(changed: boolean): void;
}

export function createPayoutPlanner(deps: PayoutDeps): PayoutPlanner {
    const {config, escrow, stelo, writes, log} = deps;
    const inFlight = createInFlight(log);

    /** The Stelo account that receives `payee`'s payouts in `currency`, or null if they have no routable wallet. */
    function route(payee: bigint, currency: string): bigint | null {
        const account = deps.playerAccounts().get(payee);
        if (!account) return null;
        const receiving = escrow.state.receivingWallets.get(receivingKey(account, currency));
        const link = receiving && escrow.state.steloLinks.get(receiving.linkId);
        return link ? BigInt(link.externalId) : null;
    }

    const poolId = (pool: BountyEscrowPool) => poolKey(pool.payerAccountIdentity, pool.payeePlayerId, pool.currency, pool.fundingAccountId);

    /** The pool's transfers of one purpose, oldest first. */
    function transfersOf(pool: BountyEscrowPool, tag: "Payout" | "Extras"): SteloTransfer[] {
        const found: SteloTransfer[] = [];
        for (const transfer of escrow.state.transfers.values()) {
            if (transfer.purpose.tag !== tag || !transfer.payerAccountIdentity.isEqual(pool.payerAccountIdentity)) continue;
            const {payeePlayerId, fundingAccountId} = transfer.purpose.value;
            if (payeePlayerId === pool.payeePlayerId && fundingAccountId === pool.fundingAccountId) found.push(transfer);
        }
        return found.sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    const hasPendingPayout = (pool: BountyEscrowPool, tag: "Payout" | "Extras") => transfersOf(pool, tag).some(isPending);

    // Pools whose extras pull was sent this sweep, waiting for it to settle or fail before their one payout goes out.
    // `afterId` is the newest earlier pull, so the pull of this sweep is the one with a higher id.
    const awaiting = new Map<string, {since: number; afterId: bigint}>();
    const AWAIT_ECHO_MS = 60_000;

    /** The notifier posts one shortfall alert per payer, currency and wallet until the reason changes or an extras pull settles. */
    function alertShortfall(pool: BountyEscrowPool, amount: bigint, reason: "cannot-pull" | "not-authorized" | "insufficient-funds"): void {
        deps.notifier?.notify({
            kind: "payout-shortfall", role: "payer", account: pool.payerAccountIdentity, currency: pool.currency,
            amount, reason, walletAccountId: pool.fundingAccountId,
        });
    }

    /** Sends the pool's whole payout in one transfer from escrow: the guaranteed part plus whatever extras were pulled. */
    function sendPayout(pool: BountyEscrowPool, destination: bigint): void {
        const currencyConfig = config.currencies[pool.currency];
        const scale = stelo.account(currencyConfig.escrowAccountId)?.ledgerScale;
        const base = poolId(pool);
        if (scale === undefined || hasPendingPayout(pool, "Payout") || inFlight.has(`payout:${base}`)) return;
        const {fromEscrow, fromWallet} = splitPayout(pool);
        const extras = pool.pulledExtras < fromWallet ? pool.pulledExtras : fromWallet;
        const amount = fromEscrow + extras;
        if (amount <= 0n) return;
        inFlight.track(`payout:${base}`, writes.recordIntent({
            currency: pool.currency,
            payer: pool.payerAccountIdentity,
            fromAccountId: currencyConfig.escrowAccountId,
            toAccountId: destination,
            amount,
            steloAmount: toSteloAmount(amount, scale),
            purpose: {tag: "Payout", value: {payeePlayerId: pool.payeePlayerId, fundingAccountId: pool.fundingAccountId, extras}},
        }), "payout intent", {payee: pool.payeePlayerId.toString(), currency: pool.currency});
    }

    /**
     * Tries to pull the pool's still-unpulled loyalty extras from its paying wallet into escrow.
     * Returns true when a pull is in flight (so the payout waits for it). A pull that cannot be tried
     * raises a shortfall alert and leaves the extras owed; the guaranteed part is paid regardless.
     */
    function pullExtras(pool: BountyEscrowPool, need: bigint): boolean {
        const base = poolId(pool);
        if (hasPendingPayout(pool, "Extras") || inFlight.has(`extras:${base}`)) return true;
        const currencyConfig = config.currencies[pool.currency];
        const scale = stelo.account(currencyConfig.escrowAccountId)?.ledgerScale;
        if (scale === undefined) return false;

        const raw = toSteloAmount(need, scale);
        const payerPlayers = new Set<bigint>();
        for (const [playerId, owner] of deps.playerAccounts()) if (owner.isEqual(pool.payerAccountIdentity)) payerPlayers.add(playerId);
        const allowed = canFundFrom(stelo, pool.fundingAccountId, payerPlayers);
        if (allowed !== "ok" || (stelo.balance(pool.fundingAccountId) ?? 0n) < raw) {
            alertShortfall(pool, need, allowed !== "ok" ? allowed : "insufficient-funds");
            return false;
        }
        inFlight.track(`extras:${base}`, writes.recordIntent({
            currency: pool.currency,
            payer: pool.payerAccountIdentity,
            fromAccountId: pool.fundingAccountId,
            toAccountId: currencyConfig.escrowAccountId,
            amount: need,
            steloAmount: raw,
            purpose: {tag: "Extras", value: {payeePlayerId: pool.payeePlayerId, fundingAccountId: pool.fundingAccountId}},
        }), "extras pull intent", {payee: pool.payeePlayerId.toString(), currency: pool.currency});
        const earlier = transfersOf(pool, "Extras");
        awaiting.set(base, {since: deps.now(), afterId: earlier.length > 0 ? earlier[earlier.length - 1].id : 0n});
        return true;
    }

    function payoutPool(pool: BountyEscrowPool, destination: bigint): void {
        const {fromWallet} = splitPayout(pool);
        const need = fromWallet - pool.pulledExtras;
        if (need > 0n && pullExtras(pool, need)) return;
        sendPayout(pool, destination);
    }

    function closeOutUnclaimed(pool: BountyEscrowPool): void {
        const policy = config.currencies[pool.currency].unclaimed;
        const key = `unclaimed:${pool.payerAccountIdentity.toHexString()}:${pool.payeePlayerId}:${pool.currency}:${pool.fundingAccountId}`;
        if (inFlight.has(key)) return;
        const fields = {payee: pool.payeePlayerId.toString(), currency: pool.currency};
        if (pool.unclaimedSince === undefined) {
            inFlight.track(key, writes.syncUnclaimed(pool.payerAccountIdentity, pool.payeePlayerId, pool.currency, pool.fundingAccountId), "flag unclaimed payee", fields);
            return;
        }
        if (deps.now() - timestampMs(pool.unclaimedSince) < policy.afterDays * DAY_MS) return;
        if (hasPendingPayout(pool, "Payout") || hasPendingPayout(pool, "Extras")) return;
        const owed = splitPayout(pool).owed;
        const settled = writes.settleUnclaimed(
            pool.payerAccountIdentity, pool.payeePlayerId, pool.currency, pool.fundingAccountId,
            policy.action === "rollover" ? policy.to : undefined,
        );
        inFlight.track(key, settled, "settle unclaimed payee", fields);
        settled.then(() => {
            const kind = policy.action === "rollover" ? "unclaimed-rolled-over" : "unclaimed-returned";
            const base = {
                kind, currency: pool.currency, amount: owed, walletAccountId: pool.fundingAccountId,
                payer: pool.payerAccountIdentity, payeePlayerId: pool.payeePlayerId,
            } as const;
            deps.notifier?.notify({...base, role: "payer", account: pool.payerAccountIdentity});
            const payee = deps.playerAccounts().get(pool.payeePlayerId);
            if (payee) deps.notifier?.notify({...base, role: "payee", account: payee});
        }).catch(() => {});
    }

    return {
        refunds() {
            if (!stelo.isLive) return;
            for (const wallet of escrow.state.escrowWallets.values()) {
                const currencyConfig = config.currencies[wallet.currency];
                if (!currencyConfig) continue;
                const amount = reservableRefundDue(escrow.state, wallet.payerAccountIdentity, wallet.currency, wallet.fundingAccountId);
                const scale = stelo.account(currencyConfig.escrowAccountId)?.ledgerScale;
                const key = `refund:${wallet.payerAccountIdentity.toHexString()}:${wallet.currency}:${wallet.fundingAccountId}`;
                if (amount <= 0n || scale === undefined || inFlight.has(key)) continue;
                inFlight.track(key, writes.recordIntent({
                    currency: wallet.currency,
                    payer: wallet.payerAccountIdentity,
                    fromAccountId: currencyConfig.escrowAccountId,
                    toAccountId: wallet.fundingAccountId,
                    amount,
                    steloAmount: toSteloAmount(amount, scale),
                    purpose: {tag: "Refund", value: {fundingAccountId: wallet.fundingAccountId}},
                }), "refund intent", {currency: wallet.currency, account: wallet.fundingAccountId.toString()});
            }
        },

        overlaps() {
            for (const pool of escrow.state.pools.values()) {
                if (overlapRelease(pool) <= 0n) continue;
                const key = `overlap:${pool.payerAccountIdentity.toHexString()}:${pool.payeePlayerId}:${pool.currency}`;
                if (inFlight.has(key)) continue;
                inFlight.track(key, writes.releaseOverlap(pool.payerAccountIdentity, pool.payeePlayerId, pool.currency), "release escrow overlap", {payee: pool.payeePlayerId.toString()});
            }
        },

        sweep() {
            if (!stelo.isLive || inFlight.has("sweep")) return;
            const last = escrow.state.schedule ? timestampMs(escrow.state.schedule.lastSweepAt) : 0;
            if (deps.now() - last < config.payoutIntervalMs) return;

            const min = BigInt(config.minPayout);
            for (const pool of escrow.state.pools.values()) {
                if (!config.currencies[pool.currency]) continue;
                const {owed} = splitPayout(pool);
                if (owed <= 0n || owed < min) continue;
                const destination = route(pool.payeePlayerId, pool.currency);
                if (destination === null) closeOutUnclaimed(pool);
                else payoutPool(pool, destination);
            }
            inFlight.track("sweep", writes.setPayoutSchedule(BigInt(config.payoutIntervalMs) * 1000n, Timestamp.now()), "set payout schedule");
        },

        resume(changed) {
            if (!stelo.isLive) return;
            // Pools whose extras pull has since settled or failed: send the one payout.
            for (const [id, entry] of [...awaiting]) {
                const pool = escrow.state.pools.get(id);
                if (!pool) {
                    awaiting.delete(id);
                    continue;
                }
                const pulls = transfersOf(pool, "Extras").filter(transfer => transfer.id > entry.afterId);
                const latest = pulls[pulls.length - 1];
                if (latest ? isPending(latest) : deps.now() - entry.since < AWAIT_ECHO_MS) continue;
                awaiting.delete(id);
                if (latest?.state.tag === "Failed") {
                    alertShortfall(pool, latest.amount, latest.failureReason === "no-permission" ? "cannot-pull" : "insufficient-funds");
                } else if (latest?.state.tag === "Settled") {
                    deps.notifier?.resolve("payout-shortfall", pool.payerAccountIdentity, pool.currency, pool.fundingAccountId);
                }
                const destination = route(pool.payeePlayerId, pool.currency);
                if (destination !== null) sendPayout(pool, destination);
            }
            // Extras already in escrow with no payout on the way (e.g. after a restart) are paid out.
            if (!changed) return;
            for (const pool of escrow.state.pools.values()) {
                if (pool.pulledExtras <= 0n || awaiting.has(poolId(pool)) || hasPendingPayout(pool, "Extras")) continue;
                const destination = route(pool.payeePlayerId, pool.currency);
                if (destination !== null) sendPayout(pool, destination);
            }
        },
    };
}
