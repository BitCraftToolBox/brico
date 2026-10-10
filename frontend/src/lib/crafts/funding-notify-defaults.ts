/**
 * funding-notify-defaults.ts — which funding alerts a sink gets when the account has no explicit
 * trigger row for it. No imports, so plain `node --test` can load it.
 */

export interface FundingFlags {
    fundingFailed: boolean;
    payoutShortfall: boolean;
    unclaimed: boolean;
}

/** With no row the toast sink is on for every event and Discord sinks are off; an explicit row (even all false) wins. */
export function resolveFundingFlags(row: FundingFlags | undefined, sinkKind: "toast" | "discord"): FundingFlags {
    if (row) return {fundingFailed: row.fundingFailed, payoutShortfall: row.payoutShortfall, unclaimed: row.unclaimed};
    const on = sinkKind === "toast";
    return {fundingFailed: on, payoutShortfall: on, unclaimed: on};
}
