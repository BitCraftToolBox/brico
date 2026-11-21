/**
 * browse.tsx — the live trade finder: every order that can be traded right now.
 *
 * Hidden: inactive orders, used-up trade limits, and shops lacking what they offer. Full shops stay
 * listed with a badge, since the owner only has to make room.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {leadingAndTrailing, throttle} from "@solid-primitives/scheduled";
import {TbOutlineChevronDown as IconChevronDown} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, Show} from "solid-js";
import type {FieldOption} from "~/components/crafts/FilterBuilder";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {tradeColumns} from "~/components/trades/trade-columns";
import {TRADES_HREF} from "~/components/trades/TradeBits";
import {type TradeFilterField, TradeQuickFilters} from "~/components/trades/TradeQuickFilters";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "~/components/ui/card";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "~/components/ui/collapsible";
import {breadcrumbCurrent} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {useSettings} from "~/lib/settings";
import {shopEntriesFrom, tradeEntriesFrom, type TradeEntry} from "~/lib/trades/entries";
import {EMPTY_TRADE_FILTER, isEmptyTradeFilter, tradeFilterTest} from "~/lib/trades/filter";
import {tradeFilterOptions} from "~/lib/trades/options";
import {createTradeRelay} from "~/lib/trades/relay";
import {cn} from "~/lib/utils";

/** Keys the persisted hidden-column set. Shares a namespace with the database tables' names. */
const TABLE_NAME = "trade-finder";

/** Picker options are rebuilt from every order; far too much to redo on each 500 ms snapshot. */
const OPTIONS_REFRESH_MS = 5000;

const COLUMNS = tradeColumns(true);

const NO_OPTIONS: Record<TradeFilterField, FieldOption[]> = {offered: [], requested: [], shops: [], claims: [], players: [], shopTypes: []};

export default function TradeFinder() {
    const {_} = useLingui();
    const {tradeFinderState} = useSettings();
    const {panelOpen, setPanelOpen, filter, setFilter, sorting, setSorting, pagination, setPagination} = tradeFinderState();
    const relay = createTradeRelay();

    const entries = createMemo(() => {
        const snapshot = relay.snapshot();
        return tradeEntriesFrom(snapshot, shopEntriesFrom(snapshot));
    });
    const listed = createMemo(() => entries().filter(entry => entry.status === "available"));
    const matched = createMemo(() => {
        const test = tradeFilterTest(filter());
        return listed().filter(test);
    });

    const [optionSource, setOptionSource] = createSignal<{all: TradeEntry[]; listed: TradeEntry[]} | null>(null);
    const refreshOptions = leadingAndTrailing(throttle, setOptionSource, OPTIONS_REFRESH_MS);
    // Gated on `ready` so the relay's initial empty state doesn't burn the throttle's leading edge.
    createEffect(() => {
        if (!relay.ready()) return;
        refreshOptions({all: entries(), listed: listed()});
    });
    const options = createMemo(() => {
        const source = optionSource();
        return source ? tradeFilterOptions(source.all, source.listed) : NO_OPTIONS;
    });

    return (
        <MainLayout
            title={_(msg`Trade Finder`)}
            ownHeading
            description="Live BitCraft barter stall and trader stand offers, filterable by item, shop, claim and player."
            navTitle={breadcrumbCurrent(TRADES_HREF)}
        >
            <div class="w-full space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground"><Trans>Trade Finder</Trans></h1>
                    <div class="ml-auto flex flex-row gap-2">
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Collapsible open={panelOpen()} onOpenChange={setPanelOpen}>
                    <Card>
                        <CardHeader>
                            <CollapsibleTrigger class="block w-full text-left">
                                <div class="flex flex-row items-center justify-between gap-2 space-y-0">
                                    <CardTitle><Trans>Filters</Trans></CardTitle>
                                    <IconChevronDown class={cn("size-5 shrink-0 text-muted-foreground transition-transform", !panelOpen() && "-rotate-90")}/>
                                </div>
                            </CollapsibleTrigger>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent class="space-y-3">
                                <TradeQuickFilters filter={filter()} options={field => options()[field]} onChange={setFilter}/>
                                <Show when={!isEmptyTradeFilter(filter())}>
                                    <Button variant="secondary" size="sm" class="h-8" onClick={() => setFilter(EMPTY_TRADE_FILTER)}>
                                        <Trans>Reset</Trans>
                                    </Button>
                                </Show>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>

                <LiveTable
                    name={TABLE_NAME}
                    columns={COLUMNS}
                    data={matched()}
                    initialState={{sorting: [{id: "unitPrice", desc: false}]}}
                    session={{sorting, setSorting, pagination, setPagination}}
                    getRowId={entry => entry.id}
                    empty={relay.ready() ? <Trans>No trades match this filter.</Trans> : <Trans>Connecting to the relay…</Trans>}
                    paginationLabel={
                        <Trans>
                            {matched().length.toLocaleString(uiLocale())} of <Plural value={listed().length} one="# tradeable order" other="# tradeable orders"/>
                            {" "}<Plural value={matched().length} one="matches" other="match"/>.
                        </Trans>
                    }
                />
            </div>
        </MainLayout>
    );
}
