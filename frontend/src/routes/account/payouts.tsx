/**
 * `/account/payouts` — the payee view: what the caller has earned from bounty rules and
 * overrides, grouped by payer.
 *
 * Live and tabular, like the rest of the crafts feature's reports — `LiveTable` with expandable
 * payer→(character, currency) subrows when a payer has more than one such line; the parent sums
 * across currencies and leaves the currency column blank if they differ. Player names here come
 * from `useLinkedIntegrations()` (the caller's own links, already carrying an `externalHandle`)
 */
import {ESCROWED_BOUNTY_CURRENCIES} from "@brico/crafts/filter";
import {msg, t} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import type {CellContext, ColumnDef} from "@tanstack/solid-table";
import {TbOutlineChevronRight as IconChevronRight, TbOutlineHistory as IconHistory} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {CurrencyFilterButton} from "~/components/crafts/CurrencyFilterButton";
import {PayoutHistoryDialog, type PayoutHistoryFilter} from "~/components/crafts/PayoutHistoryDialog";
import {PayoutScheduleLine} from "~/components/crafts/PayoutScheduleLine";
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
import {createCurrencyPolicies} from "~/lib/crafts/currency-policy";
import {type ContributorPayerGroup, createContributorEntitlements, createPayoutLogAsContributor, groupContributorRows} from "~/lib/crafts/entitlement-reports";
import {CurrencyLabel} from "~/lib/crafts/filter-condition";
import {currenciesNeedingWallet, filterByCurrency} from "~/lib/crafts/report-math";
import {useShownCurrencies} from "~/lib/crafts/shown-currencies";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";
import {cn} from "~/lib/utils";

const TABLE_NAME = "account-payouts";

interface PayoutRow {
    id: string;
    name: string;
    /** Every (player, currency) pair this row covers — one for a single-line row, or the union of
     * every sub-row's pair for a group's parent row. Scopes the history icon's filter, since
     * transactions are recorded per-player and currency, not per-group. */
    entries: {playerId: string; currency: string}[];
    /** The payer this row's earnings came from, as a hex identity — scopes the history icon's
     * filter alongside `entries`, since the caller can have transactions with more than one payer. */
    payerAccountIdentity: string;
    /** `null` on a parent row spanning several currencies. */
    currency: string | null;
    effortTotal: bigint;
    earnedTotal: bigint;
    paidTotal: bigint;
    subRows?: PayoutRow[];
}

/** One row per payer; a payer with more than one (character, currency) line expands into one
 * subrow per line. The parent shows a currency only when all its lines share one. */
function toRows(groups: readonly ContributorPayerGroup[], ownNames: ReadonlyMap<string, string>): PayoutRow[] {
    return groups.map(group => {
        const entries = group.lines.map(line => ({playerId: line.playerId, currency: line.currency}));
        const currencies = new Set(group.lines.map(line => line.currency));
        const base = {
            id: group.payerAccountIdentity,
            name: group.payerName,
            payerAccountIdentity: group.payerAccountIdentity,
            currency: currencies.size === 1 ? [...currencies][0] : null,
            entries,
            effortTotal: group.effortTotal,
            earnedTotal: group.earnedTotal,
            paidTotal: group.paidTotal,
        };
        if (group.lines.length <= 1) return base;
        return {
            ...base,
            subRows: group.lines.map(line => ({
                id: `${base.id}:${line.playerId}:${line.currency}`,
                name: ownNames.get(line.playerId) ?? line.playerId,
                payerAccountIdentity: group.payerAccountIdentity,
                currency: line.currency,
                entries: [{playerId: line.playerId, currency: line.currency}],
                effortTotal: line.effortTotal,
                earnedTotal: line.earnedTotal,
                paidTotal: line.paidTotal,
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
            cell: (props: Cell<string | null>) => <Show when={props.getValue()}>{currency => <CurrencyLabel currency={currency()}/>}</Show>,
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
    const {links, steloWalletsFor, walletsReady} = useLinkedIntegrations();
    const conn = useConnection(BRICO_APP_SERVER);
    const {rows, ready: rowsReady} = createContributorEntitlements();
    const [currencyFilter, setCurrencyFilter] = createSignal<string[]>([]);
    const groups = createMemo(() => groupContributorRows(filterByCurrency(rows(), currencyFilter())));
    const presentCurrencies = createMemo(() => [...new Set(rows().map(row => row.currency))]);
    const shownCurrencies = useShownCurrencies(presentCurrencies);
    const filterCurrencies = createMemo(() => shownCurrencies().filter(currency => presentCurrencies().includes(currency)));
    const hasEscrowed = createMemo(() => presentCurrencies().some(currency => ESCROWED_BOUNTY_CURRENCIES.includes(currency)));
    const policies = createCurrencyPolicies();
    const walletless = createMemo(() => walletsReady()
        ? currenciesNeedingWallet(
            rows(),
            currency => ESCROWED_BOUNTY_CURRENCIES.includes(currency),
            currency => steloWalletsFor(currency).some(wallet => wallet.isReceiving),
        )
        : []);
    const ownNames = createMemo(() => new Map(
        links().filter(link => link.provider === "bitcraft-ea2").map(link => [link.externalId, link.externalHandle ?? link.externalId]),
    ));
    const tableRows = createMemo(() => toRows(groups(), ownNames()));
    const {rows: paymentLog, ready: paymentLogReady} = createPayoutLogAsContributor();

    const [historyOpen, setHistoryOpen] = createSignal(false);
    const [historyFilter, setHistoryFilter] = createSignal<PayoutHistoryFilter | null>(null);
    const openHistory = (row: PayoutRow) => {
        setHistoryFilter({entries: row.entries, payerAccountIdentity: row.payerAccountIdentity});
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
            <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Craft Bounties</Trans>}
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
                    <PayoutScheduleLine show={hasEscrowed()}/>
                    <For each={walletless()}>
                        {currency => (
                            <Card class="border-warning-foreground">
                                <CardContent class="flex flex-wrap items-center gap-1 pt-6 text-sm">
                                    <CurrencyLabel currency={currency}/>
                                    <Trans>
                                        You are owed money in this currency but have no wallet to receive it. Link a wallet on your{" "}
                                        <A href="/account/profile" class="underline">profile</A>.
                                    </Trans>
                                    <Show when={policies().get(currency)}>
                                        {policy => (
                                            <Show
                                                when={policy().action === "rollover" && policy().rollTo}
                                                fallback={<Trans>Otherwise it is returned to the payer <Plural value={policy().afterDays} one="# day" other="# days"/> from its payout.</Trans>}
                                            >
                                                {rollTo => (
                                                    <Trans>
                                                        Otherwise it is rolled over to <CurrencyLabel currency={rollTo()}/> <Plural value={policy().afterDays} one="# day" other="# days"/> from its payout.
                                                    </Trans>
                                                )}
                                            </Show>
                                        )}
                                    </Show>
                                </CardContent>
                            </Card>
                        )}
                    </For>
                    <LiveTable
                        name={TABLE_NAME}
                        columns={columns}
                        data={tableRows()}
                        getRowId={row => row.id}
                        getSubRows={row => row.subRows}
                        searchColumnId="name"
                        empty={rowsReady() ? <Trans>No bounty earnings yet.</Trans> : <Trans>Loading…</Trans>}
                        toolbar={
                            <>
                                <CurrencyFilterButton currencies={filterCurrencies()} selected={currencyFilter()} onChange={setCurrencyFilter}/>
                                <Button
                                    variant="outline" size="sm" class="h-8"
                                    onClick={() => {setHistoryFilter(null); setHistoryOpen(true);}}
                                >
                                    <IconHistory class="mr-1 size-4"/><Trans>History</Trans>
                                </Button>
                            </>
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
