/**
 * link-verify.ts — decides whether a Stelo account a browser claims to control may be linked as a
 * brico payout/funding wallet.
 */
import type {SteloCurrencyConfig} from "../config.ts";
import {roleAtLeast, type SteloReadModel} from "./stelo-cache.ts";

export type LinkFailure =
    | "bot-not-member"
    | "ambiguous-address"
    | "not-debit"
    | "wrong-ledger"
    | "escrow-account"
    | "no-linked-bitcraft-player"
    | "no-owner-admin-match";

export type LinkVerdict = {ok: true; accountId: bigint; address: string; currency: string} | {ok: false; reason: LinkFailure};

/**
 * Resolves the address a browser submitted to one account id, then verifies it like `verifySteloLink`.
 * An address is unique per ledger only, so one that matches accounts on several configured ledgers is
 * `ambiguous-address`. The bot only sees accounts it belongs to, so an unknown address and one the bot
 * is not a member of are indistinguishable (`bot-not-member`).
 */
export function verifySteloAddress(
    address: string,
    linkedPlayerIds: ReadonlySet<bigint>,
    stelo: SteloReadModel,
    currencies: Readonly<Record<string, SteloCurrencyConfig>>,
): LinkVerdict {
    const matches = stelo.accountsByAddress(address).filter(account => roleAtLeast(account.role, "Read"));
    if (matches.length === 0) return {ok: false, reason: "bot-not-member"};
    let chosen = matches;
    if (matches.length > 1) {
        const ledgers = new Set(Object.values(currencies).map(config => config.ledger));
        chosen = matches.filter(account => ledgers.has(account.ledgerName));
        if (chosen.length !== 1) return {ok: false, reason: "ambiguous-address"};
    }
    return verifySteloLink(chosen[0].accountId, linkedPlayerIds, stelo, currencies);
}

/**
 * Passes when the bot is a member of `accountId` (Read is enough: only a paying wallet ever needs
 * Write, checked live by `canPull`), the account is a Debit account on a configured escrow
 * currency's ledger and is not an escrow wallet itself, and some member with kind User and role
 * Owner or Admin has a Stelo `bitcraftPlayerId` among the linking brico account's active
 * `bitcraft-ea2` players. The bot only sees accounts it belongs to, so a missing account and a
 * non-member one are indistinguishable (`bot-not-member`).
 */
export function verifySteloLink(
    accountId: bigint,
    linkedPlayerIds: ReadonlySet<bigint>,
    stelo: SteloReadModel,
    currencies: Readonly<Record<string, SteloCurrencyConfig>>,
): LinkVerdict {
    const account = stelo.account(accountId);
    if (!account || !roleAtLeast(account.role, "Read")) return {ok: false, reason: "bot-not-member"};
    if (account.kind.tag !== "Debit") return {ok: false, reason: "not-debit"};

    const currency = Object.keys(currencies).find(id => currencies[id].ledger === account.ledgerName);
    if (currency === undefined) return {ok: false, reason: "wrong-ledger"};
    if (Object.values(currencies).some(config => config.escrowAccountId === accountId)) return {ok: false, reason: "escrow-account"};

    if (linkedPlayerIds.size === 0) return {ok: false, reason: "no-linked-bitcraft-player"};
    return ownsAccount(stelo, accountId, linkedPlayerIds)
        ? {ok: true, accountId, address: account.address, currency}
        : {ok: false, reason: "no-owner-admin-match"};
}

/** Whether some User member with role Admin or Owner of `accountId` has a Stelo `bitcraftPlayerId` among `linkedPlayerIds`. */
export function ownsAccount(stelo: SteloReadModel, accountId: bigint, linkedPlayerIds: ReadonlySet<bigint>): boolean {
    return stelo.membersOf(accountId).some(member => {
        if (member.kind.tag !== "User" || !roleAtLeast(member.role, "Admin")) return false;
        const user = stelo.userByIdentity(member.memberId.toHexString());
        return user !== undefined && linkedPlayerIds.has(user.bitcraftPlayerId);
    });
}

/** Whether the bot can currently pull funds from `accountId` (role Write or above). Evaluated live, never cached on the link. */
export function canPull(stelo: SteloReadModel, accountId: bigint): boolean {
    return roleAtLeast(stelo.account(accountId)?.role, "Write");
}

/**
 * Whether the bot may pull from `accountId` for the brico account whose BitCraft players are
 * `linkedPlayerIds`: it holds Write and the linker still administers the wallet. Evaluated live
 * before every pull, so a member removed from a shared wallet stops being able to spend from it.
 */
export function canFundFrom(stelo: SteloReadModel, accountId: bigint, linkedPlayerIds: ReadonlySet<bigint>): "ok" | "cannot-pull" | "not-authorized" {
    if (!canPull(stelo, accountId)) return "cannot-pull";
    return ownsAccount(stelo, accountId, linkedPlayerIds) ? "ok" : "not-authorized";
}

/** An account as Stelo's public directory lists it. */
export interface DirectoryAccount {
    accountId: bigint;
    address: string;
    ledgerId: bigint;
    kind: {tag: string};
    primaryUsername: string | undefined;
}

export type UnverifiedMatch =
    | {ok: true; accountId: bigint; address: string; currency: string; username: string | undefined}
    | {ok: false; reason: "unknown-address" | "ambiguous-address" | "not-debit" | "wrong-ledger" | "escrow-account"};

/**
 * Picks the one account an unverified link points at from directory search `hits` (one search per
 * configured ledger): the exact address match on a configured escrow currency's ledger. No ownership
 * is checked, so the result can only ever be used to receive payouts.
 */
export function matchDirectoryHits(
    address: string,
    hits: readonly DirectoryAccount[],
    currencies: Readonly<Record<string, SteloCurrencyConfig>>,
    ledgerName: (ledgerId: bigint) => string | undefined,
): UnverifiedMatch {
    const wanted = address.toUpperCase();
    const exact = hits.filter(hit => hit.address.toUpperCase() === wanted);
    if (exact.length === 0) return {ok: false, reason: "unknown-address"};
    const configured = exact.filter(hit => Object.values(currencies).some(config => config.ledger === ledgerName(hit.ledgerId)));
    if (configured.length === 0) return {ok: false, reason: "wrong-ledger"};
    if (configured.length > 1) return {ok: false, reason: "ambiguous-address"};

    const hit = configured[0];
    if (hit.kind.tag !== "Debit") return {ok: false, reason: "not-debit"};
    if (Object.values(currencies).some(config => config.escrowAccountId === hit.accountId)) return {ok: false, reason: "escrow-account"};
    const currency = Object.keys(currencies).find(id => currencies[id].ledger === ledgerName(hit.ledgerId))!;
    return {ok: true, accountId: hit.accountId, address: hit.address, currency, username: hit.primaryUsername};
}
