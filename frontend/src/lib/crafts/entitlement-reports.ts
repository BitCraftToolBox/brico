/**
 * entitlement-reports.ts — the read side of the payout reports, backing `/account/payouts` (the
 * payee view) and `/account/payees` (the payer view).
 */
import {tables} from "@brico/bindings/brico-app";
import type {ContributorEntitlementRow, PayerEntitlementRow} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {useAccount} from "~/lib/account/state";
import type {LocalPayeeGrouping} from "~/lib/settings";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export function createContributorEntitlements(): Accessor<ContributorEntitlementRow[]> {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rows, setRows] = createSignal<ContributorEntitlementRow[]>([]);

    function readRows() {
        const active = conn.active();
        setRows(active ? [...active.db.myEntitlementsAsContributor.iter()] as ContributorEntitlementRow[] : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        const request = untrack(() =>
            conn.requestResource({key: "entitlements:contributor", tables: [bricoAppTable(tables.myEntitlementsAsContributor)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRows([]);
    }
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    return rows;
}

export function createPayerEntitlements(): Accessor<PayerEntitlementRow[]> {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rows, setRows] = createSignal<PayerEntitlementRow[]>([]);

    function readRows() {
        const active = conn.active();
        setRows(active ? [...active.db.myEntitlementsAsPayer.iter()] as PayerEntitlementRow[] : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        const request = untrack(() =>
            conn.requestResource({key: "entitlements:payer", tables: [bricoAppTable(tables.myEntitlementsAsPayer)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRows([]);
    }
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    return rows;
}

/** One payer's earnings, broken down by one of the caller's own linked BitCraft player ids. */
export interface ContributorPlayerLedger {
    playerId: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
}

/** One (payer, currency) group for the payee view — `/account/payouts`. */
export interface ContributorPayerGroup {
    payerAccountIdentity: string;
    /** Always resolved server-side (see `ContributorEntitlementRow`'s doc comment) — never needs
     * client-side name resolution. */
    payerName: string;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    players: ContributorPlayerLedger[];
}

/** Groups `myEntitlementsAsContributor` rows by `(payerAccountIdentity, currency)`, summing across
 * every one of the caller's own linked player ids that earned from that payer. */
export function groupContributorRows(rows: readonly ContributorEntitlementRow[]): ContributorPayerGroup[] {
    const groups = new Map<string, ContributorPayerGroup>();
    for (const row of rows) {
        const key = `${row.payerAccountIdentity.toHexString()}:${row.currency}`;
        const player: ContributorPlayerLedger = {
            playerId: row.payeePlayerId.toString(),
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            paidTotal: row.paidTotal,
        };
        const existing = groups.get(key);
        if (existing) {
            existing.effortTotal += row.effortTotal;
            existing.earnedTotal += row.earnedTotal;
            existing.paidTotal += row.paidTotal;
            existing.players.push(player);
        } else {
            groups.set(key, {
                payerAccountIdentity: row.payerAccountIdentity.toHexString(),
                payerName: row.payerName,
                currency: row.currency,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                paidTotal: row.paidTotal,
                players: [player],
            });
        }
    }
    return [...groups.values()];
}

/** One payee player's ledger line under a payer-view group. */
export interface PayeePlayerLedger {
    playerId: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
}

/** One payee group for the payer view — `/account/payees`. Grouped under the payee's brico account
 * when the backend resolved one (`payeeName` set); otherwise this is a single ungrouped player. */
export interface PayeeGroup {
    /** `payeeAccountIdentity` hex when grouped, else `player:<id>` */
    groupKey: string;
    payeeName: string | null;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    players: PayeePlayerLedger[];
}

export function groupPayerRows(rows: readonly PayerEntitlementRow[]): PayeeGroup[] {
    const groups = new Map<string, PayeeGroup>();
    for (const row of rows) {
        const groupKey = row.payeeAccountIdentity ? `${row.payeeAccountIdentity.toHexString()}:${row.currency}` : `player:${row.payeePlayerId}:${row.currency}`;
        const player: PayeePlayerLedger = {
            playerId: row.payeePlayerId.toString(),
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            paidTotal: row.paidTotal,
        };
        const existing = groups.get(groupKey);
        if (existing) {
            existing.effortTotal += row.effortTotal;
            existing.earnedTotal += row.earnedTotal;
            existing.paidTotal += row.paidTotal;
            existing.players.push(player);
        } else {
            groups.set(groupKey, {
                groupKey,
                payeeName: row.payeeName ?? null,
                currency: row.currency,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                paidTotal: row.paidTotal,
                players: [player],
            });
        }
    }
    return [...groups.values()];
}

/**
 * Merges `groupPayerRows`' otherwise-ungrouped single-player entries under the payer's own local
 * groupings (`LocalPayeeGrouping`, `~/lib/settings`) — a secondary, client-only lookup for payees
 * who haven't linked (or don't share) a brico account, so a payer can still aggregate them.
 */
export function applyLocalGroupings(groups: readonly PayeeGroup[], groupings: readonly LocalPayeeGrouping[]): PayeeGroup[] {
    const nameForPlayer = new Map<string, string>();
    for (const grouping of groupings) {
        for (const playerId of grouping.playerIds) {
            if (!nameForPlayer.has(playerId)) nameForPlayer.set(playerId, grouping.name);
        }
    }
    if (nameForPlayer.size === 0) return [...groups];

    const merged = new Map<string, PayeeGroup>();
    const result: PayeeGroup[] = [];
    for (const group of groups) {
        const soloId = group.payeeName === null && group.players.length === 1 ? group.players[0].playerId : null;
        const localName = soloId ? nameForPlayer.get(soloId) : undefined;
        if (!localName) {
            result.push(group);
            continue;
        }
        const key = `local:${localName}:${group.currency}`;
        const existing = merged.get(key);
        if (existing) {
            existing.effortTotal += group.effortTotal;
            existing.earnedTotal += group.earnedTotal;
            existing.paidTotal += group.paidTotal;
            existing.players.push(...group.players);
        } else {
            const combined: PayeeGroup = {...group, groupKey: key, payeeName: localName, players: [...group.players]};
            merged.set(key, combined);
            result.push(combined);
        }
    }
    return result;
}
