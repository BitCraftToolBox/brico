/**
 * stelo-cache.ts — the slice of Stelo's tables the bot reads, mirrored from row callbacks.
 *
 * Rows are typed structurally (what the bot reads, not the generated classes) so the logic that
 * consumes `SteloReadModel` needs no SDK in tests.
 */
import type {DbConnection} from "@brico/bindings/stelo";

import type {TableFeed} from "../spacetime/feed.ts";
import {refOfMemo} from "./memo.ts";

type Tagged = {tag: string};
type Hex = {toHexString(): string};

/** An account the bot is a member of (`my_accounts`). `role` is the bot's own role on it. */
export interface SteloAccount {
    accountId: bigint;
    address: string;
    kind: Tagged;
    balance: bigint;
    ledgerId: bigint;
    ledgerName: string;
    ledgerScale: number;
    role: Tagged;
}

/** A member of one of those accounts (`my_accounts_members`). */
export interface SteloMember {
    id: bigint;
    accountId: bigint;
    memberId: Hex;
    kind: Tagged;
    role: Tagged;
}

/** A transfer on one of those accounts (`my_transfers`). */
export interface SteloTransfer {
    id: bigint;
    debitAccountId: bigint;
    creditAccountId: bigint;
    postedAmount: bigint | undefined;
    state: Tagged;
    memo: string | undefined;
}

export interface SteloUser {
    id: Hex;
    bitcraftPlayerId: bigint;
}

export interface SteloLedger {
    id: bigint;
    name: string;
    scale: number;
}

const ROLE_RANK: Record<string, number> = {Read: 1, Write: 2, Admin: 3, Owner: 4};

/** True if `role` is at least `min`. */
export function roleAtLeast(role: Tagged | undefined, min: "Read" | "Write" | "Admin" | "Owner"): boolean {
    return role !== undefined && (ROLE_RANK[role.tag] ?? 0) >= ROLE_RANK[min];
}

export interface SteloReadModel {
    account(accountId: bigint): SteloAccount | undefined;
    /** Every account the bot can see with this address (addresses are unique per ledger, not globally). Case-insensitive. */
    accountsByAddress(address: string): readonly SteloAccount[];
    membersOf(accountId: bigint): readonly SteloMember[];
    userByIdentity(identityHex: string): SteloUser | undefined;
    ledger(ledgerId: bigint): SteloLedger | undefined;
    ledgerByName(name: string): SteloLedger | undefined;
    /** Every transfer seen so far, deduplicated by id. */
    transfers(): Iterable<SteloTransfer>;
    /** The posted Asset transfer whose memo starts with `ref` (see `refOfMemo`) between exactly these accounts for exactly this raw amount, if one is visible. */
    findPostedTransfer(match: {ref: string; fromAccountId: bigint; toAccountId: bigint; steloAmount: bigint}): SteloTransfer | undefined;
    /** Live balance of an account (raw units), if the bot can see it. */
    balance(accountId: bigint): bigint | undefined;
}

export interface SteloCache extends SteloReadModel {
    readonly accounts: TableFeed<SteloAccount>;
    readonly members: TableFeed<SteloMember>;
    readonly transferRows: TableFeed<SteloTransfer>;
    readonly users: TableFeed<SteloUser>;
    readonly ledgers: TableFeed<SteloLedger>;
    /** Replaces everything with a full read of `conn`'s tables. */
    load(conn: DbConnection): void;
    /** Incremented on every change, so a consumer can tell whether anything moved since it last looked. */
    readonly version: number;
}

export function createSteloCache(): SteloCache {
    const accountMap = new Map<bigint, SteloAccount>();
    const membersByAccount = new Map<bigint, Map<bigint, SteloMember>>();
    const userMap = new Map<string, SteloUser>();
    const ledgerMap = new Map<bigint, SteloLedger>();
    // `my_transfers` has no primary key and can deliver a transfer twice (once per visible leg), so this is insert-only keyed by id.
    const transferMap = new Map<bigint, SteloTransfer>();
    const transfersByRef = new Map<string, Set<bigint>>();
    let version = 0;

    const bump = () => void (version += 1);

    function setMember(row: SteloMember): void {
        let byId = membersByAccount.get(row.accountId);
        if (!byId) membersByAccount.set(row.accountId, (byId = new Map()));
        byId.set(row.id, row);
        bump();
    }

    function removeMember(row: SteloMember): void {
        const byId = membersByAccount.get(row.accountId);
        byId?.delete(row.id);
        if (byId?.size === 0) membersByAccount.delete(row.accountId);
        bump();
    }

    function setTransfer(row: SteloTransfer): void {
        const known = transferMap.get(row.id);
        transferMap.set(row.id, row);
        if (row.memo !== undefined) {
            const ref = refOfMemo(row.memo);
            const ids = transfersByRef.get(ref);
            if (ids) ids.add(row.id);
            else transfersByRef.set(ref, new Set([row.id]));
        }
        if (!known || known.state.tag !== row.state.tag) bump();
    }

    const identityKey = (row: SteloUser) => row.id.toHexString();

    // noinspection CommaExpressionJS
    return {
        accounts: {
            insert: row => (accountMap.set(row.accountId, row), bump()),
            update: (before, after) => {
                if (before.accountId !== after.accountId) accountMap.delete(before.accountId);
                accountMap.set(after.accountId, after);
                bump();
            },
            delete: row => (accountMap.delete(row.accountId), bump()),
        },
        members: {insert: setMember, update: (before, after) => (removeMember(before), setMember(after)), delete: removeMember},
        // A transfer is never removed from what the bot has already seen.
        transferRows: {insert: setTransfer, update: (_before, after) => setTransfer(after), delete: () => {}},
        users: {
            insert: row => (userMap.set(identityKey(row), row), bump()),
            update: (before, after) => {
                if (identityKey(before) !== identityKey(after)) userMap.delete(identityKey(before));
                userMap.set(identityKey(after), after);
                bump();
            },
            delete: row => (userMap.delete(identityKey(row)), bump()),
        },
        ledgers: {
            insert: row => (ledgerMap.set(row.id, row), bump()),
            update: (_before, after) => (ledgerMap.set(after.id, after), bump()),
            delete: row => (ledgerMap.delete(row.id), bump()),
        },

        load(conn) {
            accountMap.clear();
            membersByAccount.clear();
            userMap.clear();
            ledgerMap.clear();
            for (const row of conn.db.myAccounts.iter()) accountMap.set(row.accountId, row);
            for (const row of conn.db.myAccountsMembers.iter()) setMember(row);
            for (const row of conn.db.user.iter()) userMap.set(identityKey(row), row);
            for (const row of conn.db.ledger.iter()) ledgerMap.set(row.id, row);
            for (const row of conn.db.myTransfers.iter()) setTransfer(row);
            bump();
        },

        get version() {
            return version;
        },

        account: id => accountMap.get(id),
        accountsByAddress(address) {
            const wanted = address.toUpperCase();
            return [...accountMap.values()].filter(account => account.address.toUpperCase() === wanted);
        },
        membersOf: id => [...(membersByAccount.get(id)?.values() ?? [])],
        userByIdentity: hex => userMap.get(hex),
        ledger: id => ledgerMap.get(id),
        ledgerByName: name => [...ledgerMap.values()].find(ledger => ledger.name === name),
        transfers: () => transferMap.values(),
        balance: id => accountMap.get(id)?.balance,
        findPostedTransfer({ref, fromAccountId, toAccountId, steloAmount}) {
            for (const id of transfersByRef.get(ref) ?? []) {
                const row = transferMap.get(id);
                // For an Asset transfer the sender is the credited account and the receiver the debited one.
                if (row && row.state.tag === "Posted" && row.creditAccountId === fromAccountId
                    && row.debitAccountId === toAccountId && row.postedAmount === steloAmount) {
                    return row;
                }
            }
            return undefined;
        },
    };
}
