/**
 * `/account/payouts` — the payee view: what the caller has earned from bounty rules and
 * overrides, grouped by payer.
 *
 * Live and tabular, like the rest of the crafts feature's reports — `LiveTable` with expandable
 * group→player subrows when an account has earned from a payer across more than one of the
 * caller's own linked BitCraft characters. Player names here come from `useLinkedIntegrations()`
 * (the caller's own links, already carrying a live `externalHandle`) — unlike the payer view
 * (`/account/payees`), this direction never needs a prism lookup, since these are always the
 * caller's own characters.
 */
import {msg, t} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineChevronRight as IconChevronRight, TbOutlineHistory as IconHistory} from "solid-icons/tb";
import {createMemo, createSignal, Show} from "solid-js";
import {PayoutHistoryDialog, type PayoutHistoryFilter} from "~/components/crafts/PayoutHistoryDialog";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {useLinkedIntegrations} from "~/lib/account/links";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {type ContributorPayerGroup, createContributorEntitlements, createPayoutLogAsContributor, groupContributorRows} from "~/lib/crafts/entitlement-reports";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {cn} from "~/lib/utils";

const TABLE_NAME = "account-payouts";

interface PayoutRow {
    id: string;
    name: string;
    playerId: string | null;
    /** Every player id this row covers — just `[playerId]` for a single-character row, or the
     * union of every sub-row's player id for a multi-character group's parent row. Scopes the
     * history icon's filter, since transactions are recorded per-player, not per-group. */
    playerIds: string[];
    /** The payer this row's earnings came from, as a hex identity — scopes the history icon's
     * filter alongside `playerIds`/`currency`, since the caller can have transactions with more
     * than one payer. */
    payerAccountIdentity: string;
    currency: string;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    subRows?: PayoutRow[];
}

/** One row per group; a group earned across more than one of the caller's own characters expands
 * into per-character subrows, matching "no subrows needed" for the common single-character case. */
function toRows(groups: readonly ContributorPayerGroup[], ownNames: ReadonlyMap<string, string>): PayoutRow[] {
    return groups.map(group => {
        const base = {
            id: `${group.payerAccountIdentity}:${group.currency}`,
            name: group.payerName,
            payerAccountIdentity: group.payerAccountIdentity,
            currency: group.currency,
            effortTotal: group.effortTotal,
            earnedTotal: group.earnedTotal,
            paidTotal: group.paidTotal,
        };
        if (group.players.length <= 1) {
            const soloId = group.players[0]?.playerId ?? null;
            return {...base, playerId: soloId, playerIds: soloId ? [soloId] : []};
        }
        return {
            ...base,
            playerId: null,
            playerIds: group.players.map(player => player.playerId),
            subRows: group.players.map(player => ({
                id: `${base.id}:${player.playerId}`,
                name: ownNames.get(player.playerId) ?? player.playerId,
                playerId: player.playerId,
                playerIds: [player.playerId],
                payerAccountIdentity: group.payerAccountIdentity,
                currency: group.currency,
                effortTotal: player.effortTotal,
                earnedTotal: player.earnedTotal,
                paidTotal: player.paidTotal,
            })),
        };
    });
}

type Cell<TValue> = CellContext<PayoutRow, TValue>;

function buildColumns(onHistory: (row: PayoutRow) => void): ColumnDef<PayoutRow, any>[] {
    return [
        {
            id: "name",
            meta: {label: msg`Payer`},
            enableHiding: false,
            accessorFn: row => row.name,
            cell: (props: Cell<string>) => (
                <div class="flex items-center gap-1" style={{"padding-left": `${props.row.depth * 1.25}rem`}}>
                    <Show when={props.row.getCanExpand()} fallback={<span class="inline-block size-4"/>}>
                        <button type="button" class="text-muted-foreground hover:text-foreground" onClick={props.row.getToggleExpandedHandler()}>
                            <IconChevronRight class={cn("size-4 transition-transform", props.row.getIsExpanded() && "rotate-90")}/>
                        </button>
                    </Show>
                    <span class={props.row.depth > 0 ? "text-sm text-muted-foreground" : "font-medium"}>{props.getValue()}</span>
                    <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground"
                        aria-label={t`Payment history`}
                        title={t`Payment history`}
                        onClick={() => onHistory(props.row.original)}
                    >
                        <IconHistory class="size-3.5"/>
                    </button>
                </div>
            ),
        },
        {
            id: "currency",
            meta: {label: msg`Currency`},
            accessorFn: row => row.currency,
            cell: (props: Cell<string>) => <CurrencyLabel currency={props.getValue()}/>,
        },
        {
            id: "effort",
            meta: {label: msg`Effort`, align: "right"},
            accessorFn: row => row.effortTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "entitled",
            meta: {label: msg`Entitled`, align: "right"},
            accessorFn: row => row.earnedTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "paid",
            meta: {label: msg`Paid`, align: "right"},
            accessorFn: row => row.paidTotal,
            cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toLocaleString(uiLocale())}</span>,
        },
        {
            id: "difference",
            meta: {label: msg`Difference`, align: "right"},
            accessorFn: row => row.earnedTotal - row.paidTotal,
            cell: (props: Cell<bigint>) => {
                const diff = props.getValue();
                return <Badge variant={diff > 0n ? "outline" : "secondary"} class="tabular-nums">{diff > 0n ? "+" : ""}{diff.toLocaleString(uiLocale())}</Badge>;
            },
        },
    ];
}

export default function PayoutsPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const {links} = useLinkedIntegrations();
    const conn = useConnection(BRICO_APP_SERVER);
    const {rows, ready: rowsReady} = createContributorEntitlements();
    const groups = createMemo(() => groupContributorRows(rows()));
    const ownNames = createMemo(() => new Map(
        links().filter(link => link.provider === "bitcraft-ea2").map(link => [link.externalId, link.externalHandle ?? link.externalId]),
    ));
    const tableRows = createMemo(() => toRows(groups(), ownNames()));
    const {rows: paymentLog, ready: paymentLogReady} = createPayoutLogAsContributor();

    const [historyOpen, setHistoryOpen] = createSignal(false);
    const [historyFilter, setHistoryFilter] = createSignal<PayoutHistoryFilter | null>(null);
    const openHistory = (row: PayoutRow) => {
        setHistoryFilter({currency: row.currency, playerIds: row.playerIds, payerAccountIdentity: row.payerAccountIdentity});
        setHistoryOpen(true);
    };
    const columns = buildColumns(openHistory);

    return (
        <MainLayout
            title={_(msg`My payouts`)}
            hideSearch
            ownHeading
            description="What you've earned from craft bounties."
            navTitle={breadcrumb("/account", msg`My payouts`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Bounty payouts</Trans>}
                    tabs={bountyTabs()}
                    status={<ConnectionStatusBadge connections={[conn]}/>}
                />

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription><Trans>Log in to see what you've earned from bounties.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <LiveTable
                        name={TABLE_NAME}
                        columns={columns}
                        data={tableRows()}
                        getRowId={row => row.id}
                        getSubRows={row => row.subRows}
                        searchColumnId="name"
                        empty={rowsReady() ? <Trans>No bounty earnings yet.</Trans> : <Trans>Loading…</Trans>}
                        toolbar={
                            <Button
                                variant="outline" size="sm" class="h-8"
                                onClick={() => {setHistoryFilter(null); setHistoryOpen(true);}}
                            >
                                <IconHistory class="mr-1 size-4"/><Trans>History</Trans>
                            </Button>
                        }
                    />
                </Show>
            </div>
            <PayoutHistoryDialog
                open={historyOpen()}
                onOpenChange={setHistoryOpen}
                rows={paymentLog()}
                ready={paymentLogReady()}
                filter={historyFilter()}
                playerName={id => ownNames().get(id) ?? id}
            />
        </MainLayout>
    );
}
