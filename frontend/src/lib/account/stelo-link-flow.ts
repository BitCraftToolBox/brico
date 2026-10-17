/**
 * stelo-link-flow.ts — pure logic behind the "Stelo wallets" card: address input validation, the
 * copy key for a pending link's `pendingReason`, wallet grouping, and what a vanished request means.
 */
import {normalizeSteloAddress} from "@brico/crafts/stelo";

export type AddressCheck =
    | {state: "empty"}
    | {state: "invalid"}
    | {state: "valid"; address: string};

/** An empty input is not an error yet; anything else must normalize to a non-empty address. */
export function checkSteloAddress(input: string): AddressCheck {
    if (input.trim() === "") return {state: "empty"};
    const address = normalizeSteloAddress(input);
    return address === null ? {state: "invalid"} : {state: "valid", address};
}

/** Which copy to show for a waiting request; `checking` until the bot has reported a reason. */
export type PendingReasonKey =
    | "checking"
    | "bot-not-member"
    | "ambiguous-address"
    | "not-debit"
    | "wrong-ledger"
    | "escrow-account"
    | "no-linked-bitcraft-player"
    | "no-owner-admin-match"
    | "unknown-address"
    | "confirm-unverified"
    | "verified"
    | "unknown";

const KNOWN_REASONS: ReadonlySet<string> = new Set([
    "bot-not-member", "ambiguous-address", "not-debit", "wrong-ledger", "escrow-account",
    "no-linked-bitcraft-player", "no-owner-admin-match", "unknown-address", "confirm-unverified", "verified",
]);

export function pendingReasonKey(reason: string | undefined): PendingReasonKey {
    if (reason === undefined) return "checking";
    return KNOWN_REASONS.has(reason) ? (reason as PendingReasonKey) : "unknown";
}

export interface WalletGroup<T> {
    currency: string;
    wallets: T[];
    /** False when the group has wallets but none receives payouts. */
    hasReceiving: boolean;
}

/** Groups wallets by currency in first-seen order. */
export function groupWalletsByCurrency<T extends {currency: string; isReceiving: boolean}>(wallets: readonly T[]): WalletGroup<T>[] {
    const groups = new Map<string, WalletGroup<T>>();
    for (const wallet of wallets) {
        let group = groups.get(wallet.currency);
        if (!group) groups.set(wallet.currency, (group = {currency: wallet.currency, wallets: [], hasReceiving: false}));
        group.wallets.push(wallet);
        group.hasReceiving ||= wallet.isReceiving;
    }
    return [...groups.values()];
}

/** Identifies a link together with its handle, so a rename changes the key. */
export function linkKey(link: {id: bigint; externalHandle?: string}): string {
    return `${link.id}:${link.externalHandle ?? ""}`;
}

export type LinkOutcome = "waiting" | "idle" | "success" | "already-linked" | "timeout";

/**
 * What the request state means: still waiting, nothing in flight, or just vanished. A finalized
 * request inserts its link (or renames an existing one) in the same transaction, so a vanished
 * request is a success exactly when a link key (see `linkKey`) appeared that was not there when
 * the wait began. With no such change, a vanished request is `already-linked` when the submitted
 * address was already linked under that name when the wait began, else a `timeout`.
 */
export function linkOutcome(args: {
    wasWaiting: boolean;
    isWaiting: boolean;
    alreadyLinked: boolean;
    linkKeysBefore: ReadonlySet<string>;
    linkKeysNow: ReadonlySet<string>;
}): LinkOutcome {
    if (args.isWaiting) return "waiting";
    if (!args.wasWaiting) return "idle";
    for (const key of args.linkKeysNow) if (!args.linkKeysBefore.has(key)) return "success";
    return args.alreadyLinked ? "already-linked" : "timeout";
}

/** How many of `ids` equal `linkId`; used for the unlink dialog's dependents counts. */
export function countNaming(ids: Iterable<bigint | undefined>, linkId: bigint): number {
    let count = 0;
    for (const id of ids) if (id === linkId) count += 1;
    return count;
}
