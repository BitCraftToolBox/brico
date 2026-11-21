/**
 * trade-columns.tsx — columns for a table of trade orders (finder, shop page).
 */
import {msg} from "@lingui/core/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {ClaimLink, countText, Dash, OrderStatusBadges, ShopLink} from "~/components/trades/TradeBits";
import {uiLocale} from "~/lib/i18n";
import type {TradeEntry} from "~/lib/trades/entries";

type TradeCell<TValue> = CellContext<TradeEntry, TValue>;

/** Coins per unit for a pure coin trade; `undefined` sorts barters last. */
function unitPrice(entry: TradeEntry): number | undefined {
    return entry.classification.kind === "barter" ? undefined : entry.classification.unitPrice;
}

/**
 * Cells read `row.original` non-reactively: the feed rebuilds every entry object on each snapshot,
 * so rows are re-created rather than re-read. `withShop` adds shop/claim/owner/region columns.
 */
export function tradeColumns(withShop: boolean): ColumnDef<TradeEntry, any>[] {
    const columns: ColumnDef<TradeEntry, any>[] = [
        {
            id: "offer",
            meta: {label: msg`Offers`},
            enableHiding: false,
            accessorFn: entry => entry.offerKeys.join(","),
            cell: (props: TradeCell<string>) => <ItemStackArray stacks={props.row.original.offer} class="justify-start"/>,
        },
        {
            id: "request",
            meta: {label: msg`Asks for`},
            enableHiding: false,
            accessorFn: entry => entry.requestKeys.join(","),
            cell: (props: TradeCell<string>) => <ItemStackArray stacks={props.row.original.request} class="justify-start"/>,
        },
        {
            id: "unitPrice",
            meta: {label: msg`Coins each`},
            accessorFn: unitPrice,
            cell: (props: TradeCell<number | undefined>) => (
                <Show when={props.getValue() !== undefined} fallback={<Dash/>}>
                    <span class="tabular-nums">{props.getValue()!.toLocaleString(uiLocale(), {maximumFractionDigits: 2})}</span>
                </Show>
            ),
            sortUndefined: "last",
        },
        {
            id: "available",
            meta: {label: msg`Available`},
            accessorFn: entry => entry.capacity.trades ?? Number.MAX_SAFE_INTEGER,
            cell: (props: TradeCell<number>) => {
                const entry = props.row.original;
                return (
                    <span class="inline-flex flex-wrap items-center gap-1">
                        <Show when={entry.status === "available"}>
                            <span class="tabular-nums">{countText(entry.capacity.trades)}</span>
                        </Show>
                        <OrderStatusBadges entry={entry}/>
                    </span>
                );
            },
        },
        {
            id: "limit",
            meta: {label: msg`Trade limit`},
            accessorFn: entry => entry.remainingStock ?? Number.MAX_SAFE_INTEGER,
            cell: (props: TradeCell<number>) => <span class="tabular-nums">{countText(props.row.original.remainingStock)}</span>,
        },
    ];
    if (!withShop) return columns;
    return [
        ...columns,
        {
            id: "shop",
            meta: {label: msg`Shop`},
            accessorFn: entry => entry.shop.name ?? "",
            cell: (props: TradeCell<string>) => <ShopLink shop={props.row.original.shop}/>,
        },
        {
            id: "shopType",
            meta: {label: msg`Shop type`},
            accessorFn: entry => entry.shop.typeName ?? "",
            cell: (props: TradeCell<string>) => <Show when={props.getValue()} fallback={<Dash/>}>{props.getValue()}</Show>,
        },
        {
            id: "claim",
            meta: {label: msg`Claim`},
            accessorFn: entry => entry.shop.claimName ?? "",
            cell: (props: TradeCell<string>) => <ClaimLink shop={props.row.original.shop}/>,
        },
        {
            id: "owner",
            meta: {label: msg`Owner`},
            accessorFn: entry => entry.shop.ownerName ?? "",
            cell: (props: TradeCell<string>) => <Show when={props.getValue()} fallback={<Dash/>}>{props.getValue()}</Show>,
        },
        {
            id: "region",
            meta: {label: msg`Region`},
            accessorFn: entry => entry.shop.regionName,
        },
    ];
}
