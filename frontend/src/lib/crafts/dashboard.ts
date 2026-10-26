/**
 * dashboard.ts — the public dashboard's feed (`GET /dashboard`, see `dashboard-feed.ts`): its
 * shape, parsing, and the joins into table rows.
 */
import type {CraftBountyFacts} from "@brico/crafts/subject";

export const DASHBOARD_PATH = "/bounty-dashboard";

/** One payee of the owner in one currency; players of one brico account are already merged. */
export interface DashboardPayee {
    payeePlayerId: string;
    /** The merged account's display name; null for a lone player. */
    payeeName: string | null;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
}

export interface Dashboard {
    payees: DashboardPayee[];
    /** Bounties the owner pays, public and private. */
    bounties: (CraftBountyFacts & {craftId: string})[];
}

/** The key from a dashboard URL's hash (`#key=...`); a hash never reaches the server or a Referer header. */
export function readDashboardKey(hash: string): string | null {
    const key = new URLSearchParams(hash.replace(/^#/, "")).get("key")?.trim();
    return key ? key : null;
}

/** The shareable link for a key. Client only. */
export function dashboardUrl(token: string): string {
    return `${window.location.origin}${DASHBOARD_PATH}#${new URLSearchParams({key: token})}`;
}

/** Validates and decodes the feed's JSON (`u64`/`i64` arrive as decimal strings). */
export function parseDashboard(json: unknown): Dashboard {
    const body = json as {payees?: unknown; bounties?: unknown} | null;
    if (!body || !Array.isArray(body.payees) || !Array.isArray(body.bounties)) throw new Error("Malformed dashboard feed.");
    return {
        payees: body.payees.map(row => ({
            payeePlayerId: String(row.payeePlayerId),
            payeeName: typeof row.payeeName === "string" ? row.payeeName : null,
            currency: String(row.currency),
            effortTotal: BigInt(row.effortTotal),
            earnedTotal: BigInt(row.earnedTotal),
            paidTotal: BigInt(row.paidTotal),
        })),
        bounties: body.bounties.map(row => ({
            craftId: String(row.craftId),
            ratioNumerator: BigInt(row.ratioNumerator),
            ratioDenominator: BigInt(row.ratioDenominator),
            currency: String(row.currency),
            private: row.private === true,
        })),
    };
}

/** The bounties as the facts `craftEntriesFrom` joins onto crafts, keyed by craft id. */
export function bountyFactsFrom(bounties: Dashboard["bounties"]): Map<string, CraftBountyFacts> {
    return new Map(bounties.map(({craftId, ...facts}) => [craftId, facts]));
}

export interface DashboardPayeeRow {
    id: string;
    name: string;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
}

/** One table row per payee and currency, named by the account's display name or else the player's name. */
export function payeeRowsFrom(payees: readonly DashboardPayee[], playerNames: ReadonlyMap<string, string>): DashboardPayeeRow[] {
    return payees.map(payee => ({
        id: `${payee.payeePlayerId}:${payee.currency}`,
        name: payee.payeeName ?? playerNames.get(payee.payeePlayerId) ?? payee.payeePlayerId,
        currency: payee.currency,
        effortTotal: payee.effortTotal,
        earnedTotal: payee.earnedTotal,
        paidTotal: payee.paidTotal,
    }));
}
