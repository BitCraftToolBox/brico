/**
 * Column footers for the payees/payouts tables: per-currency totals of the table's filtered leaf rows,
 * one stacked line per currency so the lines align across the currency, paid and difference columns.
 * Table rows must carry `currency` (null on a multi-currency parent), `earnedTotal` and `paidTotal`.
 */
import {Trans} from "@lingui/solid/macro";
import type {HeaderContext, Table} from "@tanstack/solid-table";
import {For} from "solid-js";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {ledgerTotals} from "~/lib/crafts/report-math";
import {uiLocale} from "~/lib/i18n";

interface LedgerRow {
    currency: string | null;
    earnedTotal: bigint;
    paidTotal: bigint;
}

/** Leaf rows only: a parent's totals already include its subrows, and only leaves have one currency. */
function totalsOf<T extends LedgerRow>(table: Table<T>) {
    const leaves = table.getFilteredRowModel().flatRows
        .filter(row => row.subRows.length === 0)
        .flatMap(row => row.original.currency === null ? [] : [{...row.original, currency: row.original.currency}]);
    return [...ledgerTotals(leaves)];
}

const Line = (props: {children: unknown}) => <p class="flex h-6 items-center justify-end gap-1">{props.children as never}</p>;

export function ledgerFooters<T extends LedgerRow>() {
    const amounts = (pick: (sum: {owed: bigint; paid: bigint}) => bigint) => (ctx: HeaderContext<T, unknown>) => (
        <For each={totalsOf(ctx.table)}>
            {([, sum]) => <Line><span class="tabular-nums">{pick(sum).toLocaleString(uiLocale())}</span></Line>}
        </For>
    );
    return {
        name: () => <Trans>Total</Trans>,
        currency: (ctx: HeaderContext<T, unknown>) => (
            <For each={totalsOf(ctx.table)}>
                {([currency]) => <p class="flex h-6 items-center"><CurrencyLabel currency={currency}/></p>}
            </For>
        ),
        paid: amounts(sum => sum.paid),
        difference: amounts(sum => sum.owed),
    };
}
