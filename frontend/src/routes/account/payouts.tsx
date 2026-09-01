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
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineChevronRight as IconChevronRight} from "solid-icons/tb";
import {createMemo, Show} from "solid-js";
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
import {type ContributorPayerGroup, createContributorEntitlements, groupContributorRows} from "~/lib/crafts/entitlement-reports";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {breadcrumb} from "~/lib/game-links";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {cn} from "~/lib/utils";

const TABLE_NAME = "account-payouts";

interface PayoutRow {
    id: string;
    name: string;
    playerId: string | null;
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
            currency: group.currency,
            effortTotal: group.effortTotal,
            earnedTotal: group.earnedTotal,
            paidTotal: group.paidTotal,
        };
        if (group.players.length <= 1) {
            return {...base, playerId: group.players[0]?.playerId ?? null};
        }
        return {
            ...base,
            playerId: null,
            subRows: group.players.map(player => ({
                id: `${base.id}:${player.playerId}`,
                name: ownNames.get(player.playerId) ?? player.playerId,
                playerId: player.playerId,
                currency: group.currency,
                effortTotal: player.effortTotal,
                earnedTotal: player.earnedTotal,
                paidTotal: player.paidTotal,
            })),
        };
    });
}

type Cell<TValue> = CellContext<PayoutRow, TValue>;

const COLUMNS: ColumnDef<PayoutRow, any>[] = [
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
        meta: {label: msg`Effort`},
        accessorFn: row => row.effortTotal,
        cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
    },
    {
        id: "entitled",
        meta: {label: msg`Entitled`},
        accessorFn: row => row.earnedTotal,
        cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
    },
    {
        id: "paid",
        meta: {label: msg`Paid`},
        accessorFn: row => row.paidTotal,
        cell: (props: Cell<bigint>) => <span class="tabular-nums">{props.getValue().toString()}</span>,
    },
    {
        id: "difference",
        meta: {label: msg`Difference`},
        accessorFn: row => row.earnedTotal - row.paidTotal,
        cell: (props: Cell<bigint>) => {
            const diff = props.getValue();
            return <Badge variant={diff > 0n ? "default" : "secondary"} class="tabular-nums">{diff > 0n ? "+" : ""}{diff.toString()}</Badge>;
        },
    },
];

export default function PayoutsPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const {links} = useLinkedIntegrations();
    const conn = useConnection(BRICO_APP_SERVER);
    const rows = createContributorEntitlements();
    const groups = createMemo(() => groupContributorRows(rows()));
    const ownNames = createMemo(() => new Map(
        links().filter(link => link.provider === "bitcraft-ea2").map(link => [link.externalId, link.externalHandle ?? link.externalId]),
    ));
    const tableRows = createMemo(() => toRows(groups(), ownNames()));

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
                        columns={COLUMNS}
                        data={tableRows()}
                        getRowId={row => row.id}
                        getSubRows={row => row.subRows}
                        empty={<Trans>No bounty earnings yet.</Trans>}
                    />
                </Show>
            </div>
        </MainLayout>
    );
}
