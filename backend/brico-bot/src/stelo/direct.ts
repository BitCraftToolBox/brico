/**
 * direct.ts — wallet-to-wallet transfers between a payer's own linked wallet and any wallet
 * (`/pay stelo`). A transfer is recorded as a `Direct` intent, which the transfer executor then
 * sends and settles; it touches no escrow or entitlement books.
 */
import type {Identity} from "spacetimedb";

import type {EscrowCache} from "../app/escrow-cache.ts";
import type {SteloConfig} from "../config.ts";
import {toSteloAmount} from "./books.ts";
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
    /** Wallets on `currency`'s ledger matching the search text (see `parseSearch`). */
    searchWallets(currency: string, text: string): Promise<DirectoryAccount[]>;
    /** The one wallet whose address or primary username equals the search text; `reason` is user-facing. */
    resolveWallet(currency: string, text: string): Promise<ResolveResult>;
    /** The payer's linked wallets in `currency` that the bot can currently send from. */
    sendableWallets(payer: Identity, currency: string): {accountId: bigint; address: string}[];
    /** Checks a transfer against the bot's live view of Stelo; `reason` is user-facing. */
    prepare(args: {payer: Identity; currency: string; fromAccountId: bigint; toAccountId: bigint; amount: bigint}): Promise<PrepareResult>;
    /** Records the plan as a pending intent; rejects if the module refuses it or the connection is down. */
    submit(plan: DirectTransferPlan): Promise<void>;
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
}

export function createDirectTransfers(deps: DirectTransferDeps): DirectTransfers {
    const {config, escrow, stelo, writes} = deps;

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
        return stelo.searchAccounts(term, ledgerId, scope);
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

        async prepare({payer, currency, fromAccountId, toAccountId, amount}) {
            if (!config.currencies[currency]) return {ok: false, reason: "That currency can't be sent through Stelo."};
            if (!stelo.isLive) return {ok: false, reason: "Stelo is temporarily unavailable — try again in a moment."};
            if (amount <= 0n) return {ok: false, reason: "The amount must be positive."};
            if (fromAccountId === toAccountId) return {ok: false, reason: "The two wallets are the same."};
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
                    payer, currency, amount, steloAmount,
                    from: {accountId: fromAccountId, address: fromAccount.address, primaryUsername: from?.primaryUsername},
                    to: {accountId: toAccountId, address: to.address, primaryUsername: to.primaryUsername},
                },
            };
        },

        submit: plan => writes.recordIntent({
            currency: plan.currency,
            payer: plan.payer,
            fromAccountId: plan.from.accountId,
            toAccountId: plan.to.accountId,
            amount: plan.amount,
            steloAmount: plan.steloAmount,
            purpose: {tag: "Direct", value: {}},
        }),
    };
}
