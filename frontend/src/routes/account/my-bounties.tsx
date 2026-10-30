/**
 * `/account/my-bounties` — every bounty the caller pays: what each craft's rule or override asks for,
 * what is assigned, and for an escrowed currency whether it is funded and why not.
 */
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {createMemo, For, Show} from "solid-js";
import {PayoutRateButton} from "~/components/crafts/PayoutRateButton";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {useLinkedIntegrations} from "~/lib/account/links";
import {bountyTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {createCraftBountyFunding, createCraftBountyOverrides, createMyBountyAssignments} from "~/lib/crafts/bounty-funding";
import {craftEntriesFrom} from "~/lib/crafts/entries";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {FUNDING_STATE_LABEL, fundingReasonText} from "~/lib/crafts/funding-vocab";
import {countByStatus, type MyBountyRow, myBountyRows} from "~/lib/crafts/my-bounties";
import {createCraftRelay} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {type LabelResolver, useLabel} from "~/lib/labels";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const TABLE_NAME = "account-my-bounties";

const rateOf = (ratio: {numerator: bigint; denominator: bigint}) => Number(ratio.numerator) / Number(ratio.denominator);

const formatAmount = (value: number) => value.toLocaleString(uiLocale(), {maximumFractionDigits: 2});

const STATUS_LABEL: Record<string, MessageDescriptor> = {
    ...FUNDING_STATE_LABEL,
    assigned: msg`Assigned`,
    pending: msg`Not assigned yet`,
};

const STATUS_BADGE = {
    failed: "error", waiting: "warning", funding: "secondary", funded: "success", assigned: "success", pending: "secondary",
} as const;

interface BountyTableRow {
    id: string;
    bounty: MyBountyRow;
    name: string;
    detail: string;
    ready: boolean;
    address: string | undefined;
    /** Intended rate times the craft's full required effort. */
    total: number;
}

type Cell<TValue> = CellContext<BountyTableRow, TValue>;

const isRaising = (row: MyBountyRow) => row.assigned !== null
    && row.intended.numerator * row.assigned.denominator !== row.assigned.numerator * row.intended.denominator;

function buildColumns(label: LabelResolver): ColumnDef<BountyTableRow, any>[] {
    return [
        {
            id: "name",
            meta: {label: msg`Craft`},
            enableHiding: false,
            accessorFn: row => row.name,
            footer: () => <Trans>Estimated outgoing</Trans>,
            cell: (props: Cell<string>) => (
                <>
                    <A href={`/tools/crafts/${props.row.original.bounty.craftId}`} class="underline">{props.getValue()}</A>
                    <Show when={props.row.original.detail || props.row.original.ready}>
                        <p class="flex items-center gap-1 text-xs text-muted-foreground">
                            {props.row.original.detail}
                            <Show when={props.row.original.ready}><Badge variant="secondary"><Trans>ready</Trans></Badge></Show>
                        </p>
                    </Show>
                </>
            ),
        },
        {
            id: "rate",
            meta: {label: msg`Rate`},
            accessorFn: row => rateOf(row.bounty.intended),
            cell: (props: Cell<number>) => {
                const bounty = props.row.original.bounty;
                return (
                    <>
                        <PayoutRateButton rate={props.getValue()} currency={bounty.currency}/>
                        <Show when={isRaising(bounty)}>
                            <p class="text-xs text-muted-foreground">
                                <Trans>Assigned: <PayoutRateButton rate={rateOf(bounty.assigned!)} currency={bounty.currency}/></Trans>
                            </p>
                        </Show>
                    </>
                );
            },
        },
        {
            id: "estimatedTotal",
            meta: {label: msg`Estimated total`, align: "right"},
            accessorFn: row => row.total,
            footer: ctx => {
                const sums = () => {
                    const byCurrency = new Map<string, number>();
                    for (const row of ctx.table.getFilteredRowModel().rows) {
                        const {currency} = row.original.bounty;
                        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + row.original.total);
                    }
                    return [...byCurrency];
                };
                return (
                    <For each={sums()}>
                        {([currency, sum]) => (
                            <p class="flex h-6 items-center justify-end gap-1">
                                <span class="tabular-nums">{formatAmount(sum)}</span> <CurrencyLabel currency={currency} iconOnly={true}/>
                            </p>
                        )}
                    </For>
                );
            },
            cell: (props: Cell<number>) => (
                <span class="inline-flex items-center gap-1">
                    <span class="tabular-nums">{formatAmount(props.getValue())}</span>
                    <CurrencyLabel currency={props.row.original.bounty.currency} iconOnly={true}/>
                </span>
            ),
        },
        {
            id: "source",
            meta: {label: msg`From`},
            accessorFn: row => row.bounty.source,
            cell: (props: Cell<"rule" | "override">) => {
                const bounty = props.row.original.bounty;
                return (
                    <>
                        <A href={props.getValue() === "rule" ? "/account/bounty-rules" : `/tools/crafts/${bounty.craftId}`}
                           class="text-muted-foreground underline hover:text-foreground">
                            {props.getValue() === "rule" ? <Trans>Rule</Trans> : <Trans>Override</Trans>}
                        </A>
                        <Show when={bounty.private}><p class="text-xs text-muted-foreground"><Trans>Private</Trans></p></Show>
                    </>
                );
            },
        },
        {
            id: "status",
            meta: {label: msg`Status`},
            accessorFn: row => row.bounty.status,
            cell: (props: Cell<MyBountyRow["status"]>) => (
                <>
                    <Badge variant={STATUS_BADGE[props.getValue()]}>{label(STATUS_LABEL[props.getValue()])}</Badge>
                    <Show when={props.row.original.bounty.reason}>
                        {reason => <p class="mt-1 text-xs text-muted-foreground">{fundingReasonText(reason(), label)}</p>}
                    </Show>
                </>
            ),
        },
        {
            id: "wallet",
            meta: {label: msg`Wallet`},
            accessorFn: row => row.address,
            cell: (props: Cell<string | undefined>) => (
                <span class="text-muted-foreground">
                    <Show when={props.getValue()}>{address => <>#{address()}</>}</Show>
                    <Show when={props.row.original.bounty.spendable !== undefined}>
                        <p class="text-xs"><Trans>Held:</Trans> {props.row.original.bounty.spendable!.toString()}</p>
                    </Show>
                </span>
            ),
        },
    ];
}

export default function MyBountiesPage() {
    const {_} = useLingui();
    const label = useLabel();
    const {isLoggedIn, login} = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const links = useLinkedIntegrations();
    const overrides = createCraftBountyOverrides();
    const funding = createCraftBountyFunding();
    const assignments = createMyBountyAssignments();
    const relay = createCraftRelay();

    const crafts = createMemo(() => new Map(craftEntriesFrom(relay.snapshot()).map(entry => [entry.id, entry])));
    // The relay snapshot holds only active crafts. A collected or removed craft can no longer accrue, so it is left out.
    const rows = createMemo(() => !relay.ready() ? [] : myBountyRows({
        assignments: assignments(),
        overrides: [...overrides.overrides().values()].map(row => ({
            craftId: row.craftId, numerator: row.ratioNumerator, denominator: row.ratioDenominator, currency: row.currency, private: row.private,
        })),
        funding: funding.funding().values(),
        escrows: funding.openEscrows(),
    }).filter(row => crafts().has(row.craftId.toString())));
    const counts = createMemo(() => countByStatus(rows()));
    const addressOf = (row: MyBountyRow) => row.fundingLinkId === undefined
        ? undefined
        : links.steloWallets().find(wallet => wallet.link.id === row.fundingLinkId)?.address;
    const tableRows = createMemo<BountyTableRow[]>(() => rows().map(bounty => {
        const entry = crafts().get(bounty.craftId.toString())!;
        return {
            id: bounty.craftId.toString(),
            bounty,
            name: entry.recipeName,
            detail: [entry.claimName, entry.ownerName].filter(Boolean).join(" · "),
            ready: entry.complete,
            address: addressOf(bounty),
            total: rateOf(bounty.intended) * entry.effortTotal,
        };
    }));
    const columns = buildColumns(label);

    return (
        <MainLayout
            title={_(msg`My bounties`)}
            hideSearch
            ownHeading
            description="Every bounty you pay, with its funding status."
            navTitle={breadcrumb("/account", msg`My bounties`)}
        >
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Craft Bounties</Trans>}
                    tabs={bountyTabs()}
                    status={<ConnectionStatusBadge connections={[conn, relay]}/>}
                />

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription><Trans>Log in to see the bounties you pay.</Trans></CardDescription>
                            </CardHeader>
                            <CardContent><Button onClick={() => void login()}><Trans>Log in</Trans></Button></CardContent>
                        </Card>
                    }
                >
                    <Show when={(counts().get("failed") ?? 0) + (counts().get("waiting") ?? 0) > 0}>
                        <Card class="border-error">
                            <CardContent class="pt-6 text-sm">
                                <Plural
                                    value={(counts().get("failed") ?? 0) + (counts().get("waiting") ?? 0)}
                                    one="# bounty is not funded. It keeps retrying; fix the reason shown below."
                                    other="# bounties are not funded. They keep retrying; fix the reasons shown below."
                                />
                            </CardContent>
                        </Card>
                    </Show>

                    <LiveTable
                        name={TABLE_NAME}
                        columns={columns}
                        data={tableRows()}
                        getRowId={row => row.id}
                        searchColumnId="name"
                        empty={
                            <Show
                                when={rows().length === 0}
                                fallback={<Trans>No matches.</Trans>}
                            >
                                <Show when={funding.ready() && relay.ready()} fallback={<Trans>Loading your bounties…</Trans>}>
                                    <Trans>You don't have any bounties yet. Set one on a craft or add a rule under Bounty rules.</Trans>
                                </Show>
                            </Show>
                        }
                    />
                </Show>
            </div>
        </MainLayout>
    );
}
