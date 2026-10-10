/**
 * my-bounties.ts — one row per craft the caller pays a bounty on, merged from their assignments,
 * per-craft overrides and escrow funding rows. Imports only package specifiers so `my-bounties.test.ts`
 * runs under plain `node --test`.
 */
import type {FundingState} from "@brico/crafts/stelo";
import {type EscrowFacts, type FundingRowFacts, fundingStatusView, type Ratio} from "./funding-status.ts";

export interface AssignmentFacts extends Ratio {
    craftId: bigint;
    currency: string;
    private: boolean;
}

export interface OverrideFacts extends Ratio {
    craftId: bigint;
    currency: string;
    private: boolean;
}

export interface FundingFacts extends FundingRowFacts {
    craftId: bigint;
    currency: string;
}

/** A funding state for an escrowed currency; `assigned` for a trust currency's assignment, `pending` while it has none. */
export type BountyStatus = FundingState | "assigned" | "pending";

export interface MyBountyRow {
    craftId: bigint;
    currency: string;
    /** What the winning rule or override asks for; the assignment's own rate when neither is known. */
    intended: Ratio;
    /** The rate currently assigned, which an unfunded or raising bounty has not reached. */
    assigned: Ratio | null;
    source: "override" | "rule";
    private: boolean;
    status: BountyStatus;
    reason: string | undefined;
    fundingLinkId: bigint | undefined;
    /** Units held for crafters, when the craft has an open hold. */
    spendable: bigint | undefined;
}

/** Most urgent first: what the payer has to look at leads the page. */
const STATUS_ORDER: readonly BountyStatus[] = ["failed", "waiting", "funding", "pending", "funded", "assigned"];

export interface MyBountyInputs {
    assignments: Iterable<AssignmentFacts>;
    overrides: Iterable<OverrideFacts>;
    funding: Iterable<FundingFacts>;
    escrows: ReadonlyMap<bigint, EscrowFacts>;
}

export function myBountyRows(inputs: MyBountyInputs): MyBountyRow[] {
    const assignments = new Map<bigint, AssignmentFacts>();
    for (const row of inputs.assignments) assignments.set(row.craftId, row);
    const overrides = new Map<bigint, OverrideFacts>();
    for (const row of inputs.overrides) overrides.set(row.craftId, row);
    const funding = new Map<bigint, FundingFacts>();
    for (const row of inputs.funding) funding.set(row.craftId, row);

    const rows: MyBountyRow[] = [];
    for (const craftId of new Set([...assignments.keys(), ...overrides.keys(), ...funding.keys()])) {
        const assignment = assignments.get(craftId);
        const override = overrides.get(craftId);
        const fundingRow = funding.get(craftId);
        const assigned = assignment ? {numerator: assignment.numerator, denominator: assignment.denominator} : null;
        const view = fundingStatusView(fundingRow, assigned, inputs.escrows.get(craftId));
        const source = (view?.source ?? (override ? "override" : "rule"));
        const origin = override ?? assignment;
        const intended = view?.intended ?? (override ? {numerator: override.numerator, denominator: override.denominator} : assigned);
        const currency = fundingRow?.currency ?? origin?.currency;
        if (!intended || currency === undefined) continue;
        rows.push({
            craftId,
            currency,
            intended,
            assigned,
            source,
            private: assignment?.private ?? override?.private ?? false,
            status: view?.state ?? (assigned ? "assigned" : "pending"),
            reason: view?.reason,
            fundingLinkId: view?.fundingLinkId,
            spendable: view?.spendable,
        });
    }
    return rows.sort((a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.craftId < b.craftId ? 1 : a.craftId > b.craftId ? -1 : 0));
}

/** How many bounties are in each status, for the page summary. */
export function countByStatus(rows: readonly MyBountyRow[]): Map<BountyStatus, number> {
    const counts = new Map<BountyStatus, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return counts;
}
