/**
 * `/bounty-dashboard#key=<api key>` — a craft owner's public dashboard: their open crafts that carry one of their
 * bounties (private ones included) and a leaderboard of who they pay.
 *
 * Unlinked and unindexed; the owner shares the URL. The key (an API key with the `publicDashboard`
 * scope) is read from the hash so it never reaches a server log or Referer header. Bounties and
 * payees come from the module's polled `GET /dashboard` feed; crafts and player names from the relay.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {Meta, Title} from "@solidjs/meta";
import {useLocation} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {createMemo, Show} from "solid-js";
import {craftColumns} from "~/components/crafts/craft-columns";
import {LiveTable} from "~/components/data-table/live-table";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {Badge} from "~/components/ui/badge";
import {bountyFactsFrom, type DashboardPayeeRow, payeeRowsFrom, readDashboardKey} from "~/lib/crafts/dashboard";
import {createDashboardFeed} from "~/lib/crafts/dashboard-feed";
import {craftEntriesFrom} from "~/lib/crafts/entries";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {createCraftRelay, createPlayerNames} from "~/lib/crafts/relay";
import {uiLocale} from "~/lib/i18n";

const CRAFT_COLUMNS = craftColumns(false);

type PayeeCell<TValue> = CellContext<DashboardPayeeRow, TValue>;

const bigintCell = (props: PayeeCell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>;

const PAYEE_COLUMNS: ColumnDef<DashboardPayeeRow, any>[] = [
    {
        id: "name",
        meta: {label: msg`Payee`},
        enableHiding: false,
        accessorFn: row => row.name,
        cell: (props: PayeeCell<string>) => <span class="font-medium">{props.getValue()}</span>,
    },
    {
        id: "currency",
        meta: {label: msg`Currency`},
        accessorFn: row => row.currency,
        cell: (props: PayeeCell<string>) => <CurrencyLabel currency={props.getValue()}/>,
    },
    {
        id: "effort",
        meta: {label: msg`Effort`, align: "right"},
        accessorFn: row => row.effortTotal,
        cell: bigintCell,
    },
    {
        id: "entitled",
        meta: {label: msg`Entitled`, align: "right"},
        accessorFn: row => row.earnedTotal,
        cell: bigintCell,
    },
    {
        id: "paid",
        meta: {label: msg`Paid`, align: "right"},
        accessorFn: row => row.paidTotal,
        cell: bigintCell,
    },
    {
        id: "difference",
        meta: {label: msg`Difference`, align: "right"},
        accessorFn: row => row.earnedTotal - row.paidTotal,
        cell: (props: PayeeCell<bigint>) => {
            const diff = props.getValue();
            return <Badge variant={diff > 0n ? "outline" : "secondary"} class="tabular-nums">{diff > 0n ? "+" : ""}{diff.toLocaleString(uiLocale())}</Badge>;
        },
    },
];

export default function DashboardPage() {
    const {_} = useLingui();
    const location = useLocation();
    const key = createMemo(() => readDashboardKey(location.hash));
    const {data, error} = createDashboardFeed(key);
    const relay = createCraftRelay();
    const {names: playerNames} = createPlayerNames();

    const bounties = createMemo(() => bountyFactsFrom(data()?.bounties ?? []));
    // The relay snapshot holds only open crafts, so a bounty on a collected craft drops out on its own; a finished craft awaiting pickup is left out too.
    const crafts = createMemo(() => craftEntriesFrom(relay.snapshot(), bounties()).filter(entry => bounties().has(entry.id) && !entry.complete));
    const payees = createMemo(() => payeeRowsFrom(data()?.payees ?? [], playerNames()));

    return (
        <div class="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 py-6">
            <Title>{_(msg`Bounty dashboard`)}</Title>
            <Meta name="robots" content="noindex, nofollow"/>
            <div class="flex flex-wrap items-center gap-3">
                <h1 class="text-3xl font-bold text-foreground"><Trans>Bounty dashboard</Trans></h1>
                <div class="ml-auto flex flex-row gap-2">
                    <ConnectionStatusBadge connections={[relay]}/>
                </div>
            </div>

            <Show
                when={key()}
                fallback={<p class="text-sm text-muted-foreground"><Trans>This link has no dashboard key.</Trans></p>}
            >
                <Show when={error() === "invalid_key"}>
                    <p class="text-sm text-error"><Trans>This dashboard key is invalid or has been revoked.</Trans></p>
                </Show>
                <Show when={error() === "unavailable"}>
                    <p class="text-sm text-error">
                        <Trans>Couldn't refresh the dashboard.</Trans>{" "}
                        <Show when={data()}><Trans>Showing the last data received.</Trans></Show>
                    </p>
                </Show>

                <section class="flex flex-col gap-2">
                    <h2 class="text-xl font-semibold"><Trans>Active bounties</Trans></h2>
                    <LiveTable
                        name="dashboard-crafts"
                        columns={CRAFT_COLUMNS}
                        data={crafts()}
                        initialState={{sorting: [{id: "bounty", desc: true}, {id: "remaining", desc: true}]}}
                        getRowId={entry => entry.id}
                        empty={data() && relay.ready() ? <Trans>No open crafts have a bounty.</Trans> : <Trans>Loading…</Trans>}
                        paginationLabel={<Plural value={crafts().length} one="# craft with a bounty" other="# crafts with a bounty"/>}
                    />
                </section>

                <section class="flex flex-col gap-2">
                    <h2 class="text-xl font-semibold"><Trans>Contributors</Trans></h2>
                    <LiveTable
                        name="dashboard-payees"
                        columns={PAYEE_COLUMNS}
                        data={payees()}
                        initialState={{sorting: [{id: "effort", desc: true}]}}
                        getRowId={row => row.id}
                        searchColumnId="name"
                        empty={data() ? <Trans>No contributors yet.</Trans> : <Trans>Loading…</Trans>}
                    />
                </section>
            </Show>
        </div>
    );
}
