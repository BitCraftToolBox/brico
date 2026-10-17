/**
 * entitlement-reports.ts — the read side of the payout reports, backing `/account/payouts` (the
 * payee view) and `/account/payees` (the payer view).
 */
import {tables} from "@brico/bindings/brico-app";
import type {BountyPayoutLogRow, ContributorEntitlementRow, PayerEntitlementRow} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {useAccount} from "~/lib/account/state";
import type {LocalPayeeGrouping} from "~/lib/settings";
import type {BricoAppConnection} from "~/lib/spacetime/brico-app";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface LiveReport<TRow> {
    rows: Accessor<TRow[]>;
    /** True once this report's subscription has delivered its rows — the difference between "the
     * caller genuinely has none" and "still loading" (same reasoning as `CraftDetailRelay.ready`
     * in `~/lib/crafts/relay.ts`). Reset to `false` while logged out, same as `rows`. */
    ready: Accessor<boolean>;
}

/**
 * Subscribes to one of `brico-app`'s per-caller report views for the lifetime of the calling
 * component — live and re-subscribed whenever the caller logs in, torn down (rows/ready reset)
 * whenever they log out. Every report below is the same shape: one whole-view resource, read back
 * with `readRows` whenever it changes.
 */
function createLiveReport<TRow>(
    resourceKey: string,
    table: ReturnType<typeof bricoAppTable>,
    readRows: (conn: BricoAppConnection) => TRow[],
): LiveReport<TRow> {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [rows, setRows] = createSignal<TRow[]>([]);
    const [ready, setReady] = createSignal(false);

    function rebuild() {
        const active = conn.active();
        setRows(active ? readRows(active) : []);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        const request = untrack(() => conn.requestResource({key: resourceKey, tables: [table]}, rebuild));
        release = request.release;
        createEffect(() => {
            const isReady = request.ready();
            // Rebuild synchronously on readiness — same reasoning as `createPlayerNames`'s
            // identical effect — so `ready` never reports true over stale/empty rows.
            if (isReady) rebuild();
            setReady(isReady);
        });
    }
    function unsubscribe() {
        release?.();
        release = null;
        setRows([]);
        setReady(false);
    }
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    return {rows, ready};
}

export function createContributorEntitlements(): LiveReport<ContributorEntitlementRow> {
    return createLiveReport(
        "entitlements:contributor",
        bricoAppTable(tables.myEntitlementsAsContributor),
        conn => [...conn.db.myEntitlementsAsContributor.iter()] as ContributorEntitlementRow[],
    );
}

export function createPayerEntitlements(): LiveReport<PayerEntitlementRow> {
    return createLiveReport(
        "entitlements:payer",
        bricoAppTable(tables.myEntitlementsAsPayer),
        conn => [...conn.db.myEntitlementsAsPayer.iter()] as PayerEntitlementRow[],
    );
}

/** The caller's own transaction log as a payer — every `recordBountyPayment` row they've ever
 * appended, across every payee and currency. Backs the payment-history dialog on `/account/payees`. */
export function createPayoutLogAsPayer(): LiveReport<BountyPayoutLogRow> {
    return createLiveReport(
        "entitlements:payout-log-payer",
        bricoAppTable(tables.myBountyPayoutRecordLogAsPayer),
        conn => [...conn.db.myBountyPayoutRecordLogAsPayer.iter()] as BountyPayoutLogRow[],
    );
}

/** The other direction of `createPayoutLogAsPayer` — the caller's own transaction log as a
 * contributor, across every BitCraft player id they've ever linked. Backs the payment-history
 * dialog on `/account/payouts`. */
export function createPayoutLogAsContributor(): LiveReport<BountyPayoutLogRow> {
    return createLiveReport(
        "entitlements:payout-log-contributor",
        bricoAppTable(tables.myBountyPayoutRecordLogAsContributor),
        conn => [...conn.db.myBountyPayoutRecordLogAsContributor.iter()] as BountyPayoutLogRow[],
    );
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
