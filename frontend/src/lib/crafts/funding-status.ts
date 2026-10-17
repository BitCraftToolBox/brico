/**
 * funding-status.ts — derives what a craft's detail page shows about its escrowed bounty from the
 * caller's own funding row, assignment and escrow hold. Imports only package specifiers so
 * `funding-status.test.ts` runs under plain `node --test`.
 */
import {FUNDING_STATES, type FundingState} from "@brico/crafts/stelo";

export interface Ratio {
    numerator: bigint;
    denominator: bigint;
}

export interface FundingRowFacts {
    state: string;
    reason: string | undefined;
    source: string;
    ruleId: string | undefined;
    fundingLinkId: bigint | undefined;
    ratioNumerator: bigint;
    ratioDenominator: bigint;
}

export interface EscrowFacts {
    heldAmount: bigint;
    releasedAmount: bigint;
}

export interface FundingStatusView {
    state: FundingState;
    reason: string | undefined;
    source: "override" | "rule";
    ruleId: string | undefined;
    fundingLinkId: bigint | undefined;
    /** What the payer's rule or override asks for, which an unfunded craft does not have assigned yet. */
    intended: Ratio;
    /** The higher rate a pending top-up is raising the assignment to. */
    raisingTo: Ratio | undefined;
    /** Units reserved for crafters (`held − released`), when the craft has an open hold. */
    spendable: bigint | undefined;
}

const isState = (value: string): value is FundingState => (FUNDING_STATES as readonly string[]).includes(value);

/** `null` when the craft has no escrowed-currency intent (no funding row). */
export function fundingStatusView(
    row: FundingRowFacts | undefined,
    assigned: Ratio | null,
    escrow: EscrowFacts | undefined,
): FundingStatusView | null {
    if (!row) return null;
    const intended = {numerator: row.ratioNumerator, denominator: row.ratioDenominator};
    const state = isState(row.state) ? row.state : "waiting";
    const raising = assigned !== null && intended.numerator * assigned.denominator > assigned.numerator * intended.denominator;
    return {
        state,
        reason: row.reason,
        source: row.source === "override" ? "override" : "rule",
        ruleId: row.ruleId,
        fundingLinkId: row.fundingLinkId,
        intended,
        raisingTo: state === "funding" && raising ? intended : undefined,
        spendable: escrow ? escrow.heldAmount - escrow.releasedAmount : undefined,
    };
}
