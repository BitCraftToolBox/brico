/**
 * report-math.ts — pure helpers behind the payout reports: the next Stelo payout time, the currency
 * filter, the escrow summary and the payee wallet warning. No imports, so plain `node --test` can load it.
 */

/** `stelo_payout_schedule`'s fields, as plain numbers of microseconds. */
export interface PayoutScheduleInput {
    intervalMicros: bigint;
    lastSweepAtMicros: bigint;
}

export type PayoutTime =
    | {kind: "upcoming"; atMs: number}
    /** The next sweep was due at `sinceMs` and has not run yet. */
    | {kind: "overdue"; sinceMs: number};

/** When the next payout sweep is due (`lastSweepAt + interval`), and whether that time has passed. */
export function payoutTime(schedule: PayoutScheduleInput, nowMs: number): PayoutTime {
    const atMs = Number((schedule.lastSweepAtMicros + schedule.intervalMicros) / 1000n);
    return atMs > nowMs ? {kind: "upcoming", atMs} : {kind: "overdue", sinceMs: atMs};
}

/** Keeps the rows whose currency is selected; an empty selection keeps everything. */
export function filterByCurrency<T extends {currency: string}>(rows: readonly T[], selected: readonly string[]): T[] {
    return selected.length === 0 ? [...rows] : rows.filter(row => selected.includes(row.currency));
}

/** Σ held − released over open holds, and Σ refund due, per currency. */
export function escrowSummary(
    holds: Iterable<{currency: string; heldAmount: bigint; releasedAmount: bigint}>,
    wallets: Iterable<{currency: string; refundDue: bigint}>,
): Map<string, {held: bigint; refundDue: bigint}> {
    const summary = new Map<string, {held: bigint; refundDue: bigint}>();
    const entry = (currency: string) => {
        let existing = summary.get(currency);
        if (!existing) summary.set(currency, (existing = {held: 0n, refundDue: 0n}));
        return existing;
    };
    for (const hold of holds) entry(hold.currency).held += hold.heldAmount - hold.releasedAmount;
    for (const wallet of wallets) entry(wallet.currency).refundDue += wallet.refundDue;
    return summary;
}

/** Currencies the payee is owed more than they were paid in, but has no receiving wallet for. */
export function currenciesNeedingWallet(
    rows: readonly {currency: string; earnedTotal: bigint; paidTotal: bigint}[],
    isEscrowed: (currency: string) => boolean,
    hasReceivingWallet: (currency: string) => boolean,
): string[] {
    const needed = new Set<string>();
    for (const row of rows) {
        if (isEscrowed(row.currency) && row.earnedTotal > row.paidTotal && !hasReceivingWallet(row.currency)) needed.add(row.currency);
    }
    return [...needed];
}
