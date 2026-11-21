/**
 * TradeEventTable.tsx — barter stall sales (last 24h, or full history once loaded).
 */
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {sinceText} from "~/components/crafts/craft-columns";
import {LiveTable} from "~/components/data-table/live-table";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {Dash, ShopLink} from "~/components/trades/TradeBits";
import {Button} from "~/components/ui/button";
import {uiLocale} from "~/lib/i18n";
import type {TradeEventEntry} from "~/lib/trades/entries";

type EventCell<TValue> = CellContext<TradeEventEntry, TValue>;

function coinCell(props: EventCell<number>) {
    return <Show when={props.getValue() > 0} fallback={<Dash/>}><span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span></Show>;
}

function eventColumns(withShop: boolean): ColumnDef<TradeEventEntry, any>[] {
    const columns: ColumnDef<TradeEventEntry, any>[] = [
        {
            id: "time",
            meta: {label: msg`When`},
            accessorFn: entry => entry.timestampMs,
            cell: (props: EventCell<number>) => (
                <span class="whitespace-nowrap text-muted-foreground" title={new Date(props.getValue()).toLocaleString(uiLocale())}>
                    {sinceText(props.getValue(), Date.now(), uiLocale())}
                </span>
            ),
        },
        {
            id: "player",
            meta: {label: msg`Player`},
            accessorFn: entry => entry.actorName ?? "",
            cell: (props: EventCell<string>) => <Show when={props.getValue()} fallback={<Dash/>}>{props.getValue()}</Show>,
        },
        {
            id: "amount",
            meta: {label: msg`Trades`},
            accessorFn: entry => entry.amount ?? 0,
            cell: (props: EventCell<number>) => <span class="tabular-nums">×{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "received",
            meta: {label: msg`Player received`},
            enableSorting: false,
            accessorFn: entry => entry.received.length,
            cell: (props: EventCell<number>) => <ItemStackArray stacks={props.row.original.received} class="justify-start"/>,
        },
        {
            id: "given",
            meta: {label: msg`Player gave`},
            enableSorting: false,
            accessorFn: entry => entry.given.length,
            cell: (props: EventCell<number>) => <ItemStackArray stacks={props.row.original.given} class="justify-start"/>,
        },
        {
            id: "treasuryIn",
            meta: {label: msg`Coins to treasury`},
            accessorFn: entry => entry.treasuryIn,
            cell: coinCell,
        },
        {
            id: "treasuryOut",
            meta: {label: msg`Coins from treasury`},
            accessorFn: entry => entry.treasuryOut,
            cell: coinCell,
        },
    ];
    if (!withShop) return columns;
    return [
        ...columns.slice(0, 1),
        {
            id: "shop",
            meta: {label: msg`Shop`},
            accessorFn: entry => entry.shop?.name ?? "",
            cell: (props: EventCell<string>) => <Show when={props.row.original.shop} fallback={<Dash/>}>{shop => <ShopLink shop={shop()}/>}</Show>,
        },
        ...columns.slice(1),
    ];
}

const SHOP_COLUMNS = eventColumns(false);
const CLAIM_COLUMNS = eventColumns(true);

/** Feed it from `createEventFeed`; the "Load full history" button hides once history has loaded. */
export function TradeEventTable(props: {
    name: string;
    events: TradeEventEntry[];
    withShop: boolean;
    ready: boolean;
    historyLoaded: boolean;
    historyLoading: boolean;
    onLoadHistory: () => void;
}) {
    return (
        <LiveTable
            name={props.name}
            columns={props.withShop ? CLAIM_COLUMNS : SHOP_COLUMNS}
            data={props.events}
            initialState={{sorting: [{id: "time", desc: true}]}}
            getRowId={entry => entry.id}
            toolbar={
                <Show when={!props.historyLoaded}>
                    <Button variant="outline" size="sm" class="h-8" disabled={props.historyLoading} onClick={() => props.onLoadHistory()}>
                        <Show when={props.historyLoading} fallback={<Trans>Load full history</Trans>}><Trans>Loading history…</Trans></Show>
                    </Button>
                </Show>
            }
            empty={props.ready
                ? (props.historyLoaded ? <Trans>No recorded trades.</Trans> : <Trans>No trades in the last 24 hours.</Trans>)
                : <Trans>Loading trades…</Trans>}
        />
    );
}
