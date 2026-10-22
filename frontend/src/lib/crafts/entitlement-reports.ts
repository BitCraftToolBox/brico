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

/** One payer's earnings in one currency, by one of the caller's own linked BitCraft player ids. */
export interface ContributorPlayerLedger {
    playerId: string;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
}

/** One payer group for the payee view — `/account/payouts`. Totals sum across currencies. */
export interface ContributorPayerGroup {
    payerAccountIdentity: string;
    /** Always resolved server-side (see `ContributorEntitlementRow`'s doc comment) — never needs
     * client-side name resolution. */
    payerName: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    lines: ContributorPlayerLedger[];
}

/** Groups `myEntitlementsAsContributor` rows by payer, one line per (player, currency). */
export function groupContributorRows(rows: readonly ContributorEntitlementRow[]): ContributorPayerGroup[] {
    const groups = new Map<string, ContributorPayerGroup>();
    for (const row of rows) {
        const key = row.payerAccountIdentity.toHexString();
        const line: ContributorPlayerLedger = {
            playerId: row.payeePlayerId.toString(),
            currency: row.currency,
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            paidTotal: row.paidTotal,
        };
        const existing = groups.get(key);
        if (existing) {
            existing.effortTotal += row.effortTotal;
            existing.earnedTotal += row.earnedTotal;
            existing.paidTotal += row.paidTotal;
            existing.lines.push(line);
        } else {
            groups.set(key, {
                payerAccountIdentity: key,
                payerName: row.payerName,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                paidTotal: row.paidTotal,
                lines: [line],
            });
        }
    }
    return [...groups.values()];
}

/** One (payee player, currency) ledger line under a payer-view group. */
export interface PayeePlayerLedger {
    playerId: string;
    currency: string;
    /** The payee's brico account display name, when the backend resolved one. */
    accountName: string | null;
    effortTotal: bigint;
    earnedTotal: bigint;
    /** The part of `earnedTotal` an escrow hold covers (0 without escrow); the rest is unsecured. Payer view only. */
    guaranteedTotal: bigint;
    paidTotal: bigint;
}

/** One payee group for the payer view — `/account/payees`. Totals sum across currencies. */
export interface PayeeGroup {
    /** `local:<name>`, the payee account identity hex, or `player:<id>` */
    groupKey: string;
    /** Local grouping name or account display name; null for an ungrouped player. */
    payeeName: string | null;
    /** True for a group built from one of the payer's local groupings. */
    isLocal: boolean;
    effortTotal: bigint;
    earnedTotal: bigint;
    guaranteedTotal: bigint;
    paidTotal: bigint;
    lines: PayeePlayerLedger[];
}

/**
 * Groups `myEntitlementsAsPayer` rows by payee, one line per (player, currency). A player in one
 * of the payer's own local groupings (`LocalPayeeGrouping`, `~/lib/settings`; first match wins)
 * goes under that grouping, taking precedence over the player's brico account, so an account can
 * be split across groups; remaining players group by account, else stand alone.
 */
export function groupPayerRows(rows: readonly PayerEntitlementRow[], groupings: readonly LocalPayeeGrouping[]): PayeeGroup[] {
    const localName = new Map<string, string>();
    for (const grouping of groupings) {
        for (const playerId of grouping.playerIds) {
            if (!localName.has(playerId)) localName.set(playerId, grouping.name);
        }
    }
    const groups = new Map<string, PayeeGroup>();
    for (const row of rows) {
        const playerId = row.payeePlayerId.toString();
        const local = localName.get(playerId);
        const groupKey = local !== undefined
            ? `local:${local}`
            : row.payeeAccountIdentity ? row.payeeAccountIdentity.toHexString() : `player:${playerId}`;
        const line: PayeePlayerLedger = {
            playerId,
            currency: row.currency,
            accountName: row.payeeName ?? null,
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            guaranteedTotal: row.guaranteedTotal,
            paidTotal: row.paidTotal,
        };
        const existing = groups.get(groupKey);
        if (existing) {
            existing.effortTotal += row.effortTotal;
            existing.earnedTotal += row.earnedTotal;
            existing.guaranteedTotal += row.guaranteedTotal;
            existing.paidTotal += row.paidTotal;
            existing.lines.push(line);
        } else {
            groups.set(groupKey, {
                groupKey,
                payeeName: local ?? row.payeeName ?? null,
                isLocal: local !== undefined,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                guaranteedTotal: row.guaranteedTotal,
                paidTotal: row.paidTotal,
                lines: [line],
            });
        }
    }
    return [...groups.values()];
}
