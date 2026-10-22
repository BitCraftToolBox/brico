/**
 * direct.ts — wallet-to-wallet transfers between a payer's own linked wallet and any wallet
 * (`/pay stelo`). A transfer is recorded as a `Direct` (or `DirectNote`) intent, which the transfer
 * executor then sends and settles; it touches no escrow or entitlement books.
 */
import type {SteloTransfer} from "@brico/bindings/brico-app/types";
import type {Identity} from "spacetimedb";

import type {EscrowCache} from "../app/escrow-cache.ts";
import type {SteloConfig} from "../config.ts";
import {isPending, toSteloAmount} from "./books.ts";
import type {DirectoryAccount} from "./link-verify.ts";
import {canFundFrom} from "./link-verify.ts";
import type {SteloReadModel} from "./stelo-cache.ts";
import type {SteloWrites} from "./writes.ts";

export interface DirectWallet {
    accountId: bigint;
    address: string;
    primaryUsername: string | undefined;
}

/** A validated transfer, ready to confirm and submit. */
export interface DirectTransferPlan {
    payer: Identity;
    currency: string;
    /** Whole brico units. */
    amount: bigint;
    steloAmount: bigint;
    from: DirectWallet;
    to: DirectWallet;
    /** The payer's note for the memo (see `normalizeSteloNote`). */
    note: string | undefined;
}

export type PrepareResult = {ok: true; plan: DirectTransferPlan} | {ok: false; reason: string};

/** How Stelo shows a wallet: `@user (#address)` for a user's primary account, otherwise `#address`. */
export function walletLabel(wallet: {address: string; primaryUsername: string | undefined}): string {
    return wallet.primaryUsername === undefined ? `#${wallet.address}` : `@${wallet.primaryUsername} (#${wallet.address})`;
}

/** Splits a search box's text: `@` searches primary usernames, `#` addresses, anything else both. */
function parseSearch(raw: string): {term: string; scope: "Username" | "Address" | undefined} {
    const text = raw.trim();
    if (text.startsWith("@")) return {term: text.slice(1), scope: "Username"};
    if (text.startsWith("#")) return {term: text.slice(1), scope: "Address"};
    return {term: text, scope: undefined};
}

export type ResolveResult = {ok: true; accountId: bigint} | {ok: false; reason: string};

export interface DirectTransfers {
    /** Wallets on `currency`'s ledger matching the search text (see `parseSearch`), excluding the bot's escrow wallets. */
    searchWallets(currency: string, text: string): Promise<DirectoryAccount[]>;
    /** The one wallet whose address or primary username equals the search text; `reason` is user-facing. */
    resolveWallet(currency: string, text: string): Promise<ResolveResult>;
    /** The payer's linked wallets in `currency` that the bot can currently send from. */
    sendableWallets(payer: Identity, currency: string): {accountId: bigint; address: string}[];
    /** Checks a transfer against the bot's live view of Stelo; `reason` is user-facing. */
    prepare(args: {payer: Identity; currency: string; fromAccountId: bigint; toAccountId: bigint; amount: bigint; note?: string}): Promise<PrepareResult>;
    /**
     * Records the plan as a pending intent; rejects if the module refuses it or the connection is down.
     * `onOutcome` is called once (by `pollOutcomes`) when the intent settles or fails, for up to 15 minutes
     * and only while the bot keeps running.
     */
    submit(plan: DirectTransferPlan, onOutcome?: (outcome: DirectOutcome) => void): Promise<void>;
    /** Reports the outcome of every submitted transfer whose intent has settled or failed; run once per step. */
    pollOutcomes(): void;
}

/** How a submitted transfer ended; `reason` is the failure kind the executor recorded (e.g. `insufficient-funds`). */
export type DirectOutcome = {ok: true} | {ok: false; reason: string};

/** Discord's interaction tokens, which the outcome callbacks edit through, last this long. */
const WATCH_MS = 15 * 60 * 1000;

interface OutcomeWatcher {
    plan: DirectTransferPlan;
    /** Ids of matching intents that are not this transfer's: those from before it was submitted, and ones already reported to another watcher. */
    known: Set<bigint>;
    since: number;
    intentId?: bigint;
    onOutcome(outcome: DirectOutcome): void;
}

export interface DirectTransferDeps {
    config: SteloConfig;
    escrow: EscrowCache;
    /** BitCraft player id -> brico account, from active `bitcraft-ea2` links. */
    playerAccounts(): ReadonlyMap<bigint, Identity>;
    stelo: SteloReadModel & {
        readonly isLive: boolean;
        lookupAccount(accountId: bigint): Promise<DirectoryAccount | undefined>;
        searchAccounts(term: string, ledgerId: bigint, scope?: "Username" | "Address"): Promise<DirectoryAccount[]>;
    };
    writes: SteloWrites;
    now?(): number;
}

export function createDirectTransfers(deps: DirectTransferDeps): DirectTransfers {
    const {config, escrow, stelo, writes} = deps;
    const now = deps.now ?? Date.now;
    const escrowAccountIds = new Set(Object.values(config.currencies).map(currency => currency.escrowAccountId));
    const watchers: OutcomeWatcher[] = [];

    /** The direct intents (oldest first) with the plan's payer, wallets, amount and note. */
    function matchingIntents(plan: DirectTransferPlan): SteloTransfer[] {
        const found: SteloTransfer[] = [];
        for (const intent of escrow.state.transfers.values()) {
            const {purpose} = intent;
            const note = purpose.tag === "DirectNote" ? purpose.value.note : undefined;
            if ((purpose.tag === "Direct" || purpose.tag === "DirectNote") && note === plan.note
                && intent.payerAccountIdentity.isEqual(plan.payer) && intent.fromAccountId === plan.from.accountId
                && intent.toAccountId === plan.to.accountId && intent.steloAmount === plan.steloAmount) {
                found.push(intent);
            }
        }
        return found.sort((a, b) => (a.id < b.id ? -1 : 1));
    }

    function sendableWallets(payer: Identity, currency: string): {accountId: bigint; address: string}[] {
        const players = new Set<bigint>();
        for (const [playerId, owner] of deps.playerAccounts()) if (owner.isEqual(payer)) players.add(playerId);

        const wallets: {accountId: bigint; address: string}[] = [];
        for (const link of escrow.state.steloLinks.values()) {
            if (!link.accountIdentity.isEqual(payer) || !/^\d+$/.test(link.externalId)) continue;
            if (escrow.state.steloWallets.get(link.id)?.currency !== currency) continue;
            const accountId = BigInt(link.externalId);
            const account = stelo.account(accountId);
            if (account && canFundFrom(stelo, accountId, players) === "ok") wallets.push({accountId, address: account.address});
        }
        return wallets;
    }

    async function searchWallets(currency: string, text: string): Promise<DirectoryAccount[]> {
        const ledgerId = stelo.ledgerByName(config.currencies[currency]?.ledger ?? "")?.id;
        const {term, scope} = parseSearch(text);
        if (ledgerId === undefined || term === "" || !stelo.isLive) return [];
        return (await stelo.searchAccounts(term, ledgerId, scope)).filter(hit => !escrowAccountIds.has(hit.accountId));
    }

    return {
        sendableWallets,
        searchWallets,

        async resolveWallet(currency, text) {
            const {term, scope} = parseSearch(text);
            if (term === "") return {ok: false, reason: "Enter the destination wallet."};
            let hits: DirectoryAccount[];
            try {
                hits = await searchWallets(currency, text);
            } catch {
                return {ok: false, reason: "Couldn't reach Stelo to look up the wallet — try again in a moment."};
            }
            const wanted = term.toLowerCase();
            const exact = hits.filter(hit =>
                (scope !== "Username" && hit.address.toLowerCase() === wanted)
                || (scope !== "Address" && hit.primaryUsername?.toLowerCase() === wanted));
            if (exact.length === 1) return {ok: true, accountId: exact[0].accountId};
            return {
                ok: false,
                reason: exact.length === 0
                    ? `No wallet matching "${text.trim()}" was found — pick one from the suggestions.`
                    : `"${text.trim()}" matches several wallets — start with @ for a user or # for an address, or pick one from the suggestions.`,
            };
        },

        async prepare({payer, currency, fromAccountId, toAccountId, amount, note}) {
            if (!config.currencies[currency]) return {ok: false, reason: "That currency can't be sent through Stelo."};
            if (!stelo.isLive) return {ok: false, reason: "Stelo is temporarily unavailable — try again in a moment."};
            if (amount <= 0n) return {ok: false, reason: "The amount must be positive."};
            if (fromAccountId === toAccountId) return {ok: false, reason: "The two wallets are the same."};
            if (escrowAccountIds.has(fromAccountId) || escrowAccountIds.has(toAccountId)) {
                return {ok: false, reason: "The bot's escrow wallets can't be used for direct transfers."};
            }
            if (!sendableWallets(payer, currency).some(wallet => wallet.accountId === fromAccountId)) {
                return {ok: false, reason: "That isn't one of your linked wallets the bot can send from."};
            }

            const fromAccount = stelo.account(fromAccountId);
            if (!fromAccount) return {ok: false, reason: "That wallet isn't visible to the bot right now."};

            let from: DirectoryAccount | undefined;
            let to: DirectoryAccount | undefined;
            try {
                [from, to] = await Promise.all([stelo.lookupAccount(fromAccountId), stelo.lookupAccount(toAccountId)]);
            } catch {
                return {ok: false, reason: "Couldn't reach Stelo to look up the wallets — try again in a moment."};
            }
            if (!to) return {ok: false, reason: "The destination wallet doesn't exist."};
            if (to.ledgerId !== fromAccount.ledgerId) return {ok: false, reason: "The destination wallet is on a different ledger."};

            const steloAmount = toSteloAmount(amount, fromAccount.ledgerScale);
            if ((stelo.balance(fromAccountId) ?? 0n) < steloAmount) {
                return {ok: false, reason: "That wallet's balance doesn't cover the amount."};
            }

            return {
                ok: true,
                plan: {
                    payer, currency, amount, steloAmount, note,
                    from: {accountId: fromAccountId, address: fromAccount.address, primaryUsername: from?.primaryUsername},
                    to: {accountId: toAccountId, address: to.address, primaryUsername: to.primaryUsername},
                },
            };
        },

        async submit(plan, onOutcome) {
            // Rows that already match belong to earlier transfers, so the watcher never mistakes one for this transfer.
            const known = new Set(matchingIntents(plan).map(intent => intent.id));
            await writes.recordIntent({
                currency: plan.currency,
                payer: plan.payer,
                fromAccountId: plan.from.accountId,
                toAccountId: plan.to.accountId,
                amount: plan.amount,
                steloAmount: plan.steloAmount,
                purpose: plan.note === undefined ? {tag: "Direct", value: {}} : {tag: "DirectNote", value: {note: plan.note}},
            });
            if (onOutcome) watchers.push({plan, known, since: now(), onOutcome});
        },

        pollOutcomes() {
            const claimed = new Set(watchers.flatMap(watcher => (watcher.intentId === undefined ? [] : [watcher.intentId])));
            for (const watcher of [...watchers]) {
                if (now() - watcher.since > WATCH_MS) {
                    watchers.splice(watchers.indexOf(watcher), 1);
                    continue;
                }
                watcher.intentId ??= matchingIntents(watcher.plan).find(intent => !watcher.known.has(intent.id) && !claimed.has(intent.id))?.id;
                if (watcher.intentId === undefined) continue;
                claimed.add(watcher.intentId);

                const intent = escrow.state.transfers.get(watcher.intentId);
                if (!intent || isPending(intent)) continue;
                watchers.splice(watchers.indexOf(watcher), 1);
                for (const other of watchers) other.known.add(intent.id);
                watcher.onOutcome(intent.state.tag === "Settled" ? {ok: true} : {ok: false, reason: intent.failureReason ?? "unknown"});
            }
        },
    };
}
