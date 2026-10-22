/**
 * links.ts — finalizes Stelo wallet links: resolves and verifies each submitted candidate address (or,
 * for an unverified request, matches it in Stelo's public directory and waits for the browser to
 * confirm), tells the module what happened, registers a link's ledger as its wallet currency and
 * mirrors whether the bot can pull from each wallet and whether its linker still administers it.
 */
import type {Identity} from "spacetimedb";
import type {EscrowCache} from "../app/escrow-cache.ts";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {createInFlight} from "./inflight.ts";
import {canPull, type DirectoryAccount, matchDirectoryHits, ownsAccount, type UnverifiedMatch, verifySteloAddress} from "./link-verify.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {SteloWrites} from "./writes.ts";

export interface LinkDeps {
    config: SteloConfig;
    escrow: EscrowCache;
    /** BitCraft player id -> brico account, from active `bitcraft-ea2` links. */
    playerAccounts(): ReadonlyMap<bigint, Identity>;
    stelo: SteloReadModel & {
        readonly isLive: boolean;
        searchAddress(address: string, ledgerId: bigint): Promise<DirectoryAccount[]>;
        lookupAccount(accountId: bigint): Promise<DirectoryAccount | undefined>;
    };
    writes: SteloWrites;
    log: Logger;
    /** How long a write blocks a repeat of itself after it settles; see `createInFlight`. */
    holdMs?: number;
}

/**
 * Safe to run every tick and whenever Stelo's rows change: a request that doesn't verify yet is
 * retried as soon as the bot's view of Stelo moves (e.g. the user grants it membership after
 * submitting), until the module expires the request.
 */
export function createLinkProcessor(deps: LinkDeps): {run(): void} {
    const {config, escrow, stelo, writes, log} = deps;
    const inFlight = createInFlight(log, deps.holdMs);
    // The reason (and matched username) last sent per request, so an unchanged one isn't written again.
    const lastReason = new Map<string, string>();
    // Directory match per request code, for the address it was resolved for.
    const matches = new Map<string, {address: string; result: UnverifiedMatch}>();
    // Currency of a wallet the bot is not a member of, found by directory lookup, per link id.
    const lookedUp = new Map<bigint, string>();

    function playersByAccount(): Map<string, Set<bigint>> {
        const byAccount = new Map<string, Set<bigint>>();
        for (const [playerId, owner] of deps.playerAccounts()) {
            const key = owner.toHexString();
            const ids = byAccount.get(key);
            if (ids) ids.add(playerId);
            else byAccount.set(key, new Set([playerId]));
        }
        return byAccount;
    }

    const currencyOfLedger = (ledgerName: string | undefined) =>
        ledgerName === undefined ? undefined : Object.keys(config.currencies).find(id => config.currencies[id].ledger === ledgerName);

    /** Searches every configured ledger for the address and records the match for `code`. */
    function resolveInDirectory(code: string, address: string): void {
        const key = `directory:${code}`;
        if (inFlight.has(key) || !stelo.isLive) return;
        const ledgerIds = Object.values(config.currencies)
            .map(currency => stelo.ledgerByName(currency.ledger)?.id)
            .filter((id): id is bigint => id !== undefined);
        const search = Promise.all(ledgerIds.map(id => stelo.searchAddress(address, id)))
            .then(found => {
                matches.set(code, {
                    address,
                    result: matchDirectoryHits(address, found.flat(), config.currencies, id => stelo.ledger(id)?.name),
                });
            });
        inFlight.track(key, search, "search stelo directory", {code});
    }

    function report(code: string, reason: string, username: string | undefined): void {
        const key = `${reason}:${username ?? ""}`;
        if (lastReason.get(code) === key) return;
        lastReason.set(code, key);
        inFlight.track(`link:${code}`, writes.noteLinkStatus(code, reason, username), "note stelo link status", {code});
    }

    return {
        run() {
            const players = playersByAccount();
            const playersOf = (account: Identity) => players.get(account.toHexString()) ?? new Set<bigint>();

            for (const request of escrow.state.linkRequests.values()) {
                if (request.externalId !== undefined || request.candidateAddress === undefined || request.accountIdentity === undefined) continue;
                const key = `link:${request.code}`;
                if (inFlight.has(key)) continue;

                const address = request.candidateAddress;
                const verdict = verifySteloAddress(address, playersOf(request.accountIdentity), stelo, config.currencies);
                if (verdict.ok) {
                    // Verification can pass after an unverified match was shown; clear that state so the module accepts the finalize.
                    const finalize = (request.pendingReason === "confirm-unverified"
                        ? writes.noteLinkStatus(request.code, "verified", undefined)
                        : Promise.resolve()
                    ).then(() => writes.noteLinkExternal(request.code, verdict.accountId, address));
                    inFlight.track(key, finalize, "finalize stelo link", {code: request.code});
                    continue;
                }
                if (!request.unverified) {
                    report(request.code, verdict.reason, undefined);
                    continue;
                }

                const known = matches.get(request.code);
                if (!known || known.address !== address) {
                    resolveInDirectory(request.code, address);
                    continue;
                }
                const match = known.result;
                if (!match.ok) report(request.code, match.reason, undefined);
                else if (!request.confirmed) report(request.code, "confirm-unverified", match.username);
                else inFlight.track(key, writes.noteLinkExternal(request.code, match.accountId, address), "finalize unverified stelo link", {code: request.code});
            }
            for (const code of [...lastReason.keys()]) if (!escrow.state.linkRequests.has(code)) lastReason.delete(code);
            for (const code of [...matches.keys()]) if (!escrow.state.linkRequests.has(code)) matches.delete(code);

            for (const link of escrow.state.steloLinks.values()) {
                if (!/^\d+$/.test(link.externalId)) continue;
                const accountId = BigInt(link.externalId);

                // Every active link needs its wallet row naming the ledger's currency.
                if (!escrow.state.steloWallets.has(link.id)) {
                    const account = stelo.account(accountId);
                    const currency = account ? currencyOfLedger(account.ledgerName) : lookedUp.get(link.id);
                    const key = `wallet:${link.id}`;
                    if (!currency) {
                        // An unverified wallet is not in the bot's own accounts; its ledger comes from the directory.
                        const lookupKey = `lookup:${link.id}`;
                        if (!account && stelo.isLive && !inFlight.has(lookupKey)) {
                            inFlight.track(lookupKey, stelo.lookupAccount(accountId).then(hit => {
                                const found = hit && currencyOfLedger(stelo.ledger(hit.ledgerId)?.name);
                                if (found) lookedUp.set(link.id, found);
                            }), "look up stelo wallet", {link: link.id.toString()});
                        }
                        continue;
                    }
                    if (inFlight.has(key)) continue;
                    inFlight.track(key, writes.registerWallet(link.id, currency), "register stelo wallet", {link: link.id.toString()});
                    continue;
                }

                // The status row mirrors the bot's live view, written on change only. Skipped while Stelo is down, when every role would read as missing.
                const key = `wallet-status:${link.id}`;
                if (!stelo.isLive || inFlight.has(key)) continue;
                const pullable = canPull(stelo, accountId);
                const verified = stelo.account(accountId) !== undefined && ownsAccount(stelo, accountId, playersOf(link.accountIdentity));
                const stored = escrow.state.walletStatuses.get(link.id);
                if (stored?.canPull === pullable && stored.verified === verified) continue;
                inFlight.track(key, writes.setWalletStatus(link.id, pullable, verified), "set stelo wallet status", {link: link.id.toString()});
            }
        },
    };
}
