/**
 * stock-columns.tsx — columns for the stock manager's per-good table.
 */
import {issueUrgency, type StockIssue, type StockLine, type StockLineOrder} from "@brico/trades/stock-plan";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineAdjustments as IconAdjust} from "solid-icons/tb";
import {Show} from "solid-js";
import {GoodLabel, StockIssueBadges} from "~/components/trades/StockIssues";
import {countText, Dash, shopHref} from "~/components/trades/TradeBits";
import {Button} from "~/components/ui/button";
import {uiLocale} from "~/lib/i18n";

export interface StockRow {
    line: StockLine;
    /** `line.issues` minus a `missing-order` that hasn't persisted long enough to be real. */
    issues: StockIssue[];
    intakeName: string;
    outletName: string;
}

type StockCell<TValue> = CellContext<StockRow, TValue>;

const num = (value: number, digits = 0) => value.toLocaleString(uiLocale(), {maximumFractionDigits: digits});

function numberCell(digits = 0) {
    return (props: StockCell<number | undefined>) => (
        <Show when={props.getValue() !== undefined} fallback={<Dash/>}>
            <span class="tabular-nums">{num(props.getValue()!, digits)}</span>
        </Show>
    );
}

/** Lowest price among a side's orders; buy and sell lines normally have one order each. */
function price(orders: StockLineOrder[]): number | undefined {
    return orders.length ? Math.min(...orders.map(order => order.unitPrice)) : undefined;
}

function sellable(line: StockLine): number | undefined {
    if (!line.sellOrders.length) return undefined;
    let total = 0;
    for (const order of line.sellOrders) {
        if (order.capacity.trades === null) return Number.MAX_SAFE_INTEGER;
        total += order.capacity.trades * order.goodQuantity;
    }
    return total;
}

export function stockColumns(onEdit: (row: StockRow) => void): ColumnDef<StockRow, any>[] {
    return [
        {
            id: "good",
            meta: {label: msg`Item`},
            enableHiding: false,
            accessorFn: row => row.line.good,
            cell: (props: StockCell<string>) => <GoodLabel line={props.row.original.line}/>,
        },
        {
            id: "stalls",
            meta: {label: msg`Stalls`},
            accessorFn: row => `${row.intakeName} ${row.outletName}`,
            cell: (props: StockCell<string>) => {
                const row = props.row.original;
                return (
                    <span class="text-sm">
                        <A href={shopHref(row.line.intakeShopId)} class="hover:underline">{row.intakeName}</A>
                        <Show when={row.line.linked}>
                            {" → "}<A href={shopHref(row.line.outletShopId)} class="hover:underline">{row.outletName}</A>
                        </Show>
                    </span>
                );
            },
        },
        {
            id: "status",
            meta: {label: msg`Status`},
            accessorFn: row => issueUrgency(row.issues),
            cell: (props: StockCell<number>) => <StockIssueBadges issues={props.row.original.issues}/>,
        },
        {
            id: "buyPrice",
            meta: {label: msg`Buys at`},
            accessorFn: row => price(row.line.buyOrders),
            cell: numberCell(2),
            sortUndefined: "last",
        },
        {
            id: "buyRemaining",
            meta: {label: msg`Buy limit left`},
            accessorFn: row => (row.line.buyOrders.length ? row.line.buyRemaining ?? Number.MAX_SAFE_INTEGER : undefined),
            cell: (props: StockCell<number | undefined>) => (
                <Show when={props.row.original.line.buyOrders.length} fallback={<Dash/>}>
                    <span class="tabular-nums">{countText(props.row.original.line.buyRemaining)}</span>
                </Show>
            ),
            sortUndefined: "last",
        },
        {
            id: "intakeOnHand",
            meta: {label: msg`Intake stock`},
            accessorFn: row => row.line.intakeOnHand,
            cell: numberCell(),
        },
        {
            id: "outletOnHand",
            meta: {label: msg`Outlet stock`},
            accessorFn: row => (row.line.linked ? row.line.outletOnHand : undefined),
            cell: numberCell(),
            sortUndefined: "last",
        },
        {
            id: "sellPrice",
            meta: {label: msg`Sells at`},
            accessorFn: row => price(row.line.sellOrders),
            cell: numberCell(2),
            sortUndefined: "last",
        },
        {
            id: "sellable",
            meta: {label: msg`Sellable units`},
            accessorFn: row => sellable(row.line),
            cell: (props: StockCell<number | undefined>) => (
                <Show when={props.getValue() !== undefined} fallback={<Dash/>}>
                    <span class="tabular-nums">{props.getValue() === Number.MAX_SAFE_INTEGER ? "∞" : num(props.getValue()!)}</span>
                </Show>
            ),
            sortUndefined: "last",
        },
        {
            id: "spread",
            meta: {label: msg`Margin each`},
            accessorFn: row => row.line.spread ?? undefined,
            cell: numberCell(2),
            sortUndefined: "last",
        },
        {
            id: "bought24h",
            meta: {label: msg`Bought 24h`},
            accessorFn: row => row.line.bought24h,
            cell: numberCell(),
        },
        {
            id: "sold24h",
            meta: {label: msg`Sold 24h`},
            accessorFn: row => row.line.sold24h,
            cell: numberCell(),
        },
        {
            id: "hoursToEmpty",
            meta: {label: msg`Hours until empty`},
            accessorFn: row => row.line.hoursToEmpty ?? undefined,
            cell: numberCell(1),
            sortUndefined: "last",
        },
        {
            id: "edit",
            meta: {label: msg`Settings`},
            enableSorting: false,
            enableHiding: false,
            cell: (props: StockCell<unknown>) => (
                <Button variant="ghost" size="sm" class="h-8" onClick={() => onEdit(props.row.original)}>
                    <IconAdjust class="size-4"/><span class="sr-only"><Trans>Edit settings</Trans></span>
                </Button>
            ),
        },
    ];
}
