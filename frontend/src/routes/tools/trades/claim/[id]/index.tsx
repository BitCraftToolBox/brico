/**
 * [id].tsx — one claim's shops: claim-owned barter stalls and members' trader stands, each with
 * their orders, plus the stalls' sales.
 */
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import {createMemo, createSignal, For, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {ShopCard} from "~/components/trades/ShopCard";
import {parseEntityId, stockHref, TRADES_HREF} from "~/components/trades/TradeBits";
import {TradeEventTable} from "~/components/trades/TradeEventTable";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "~/components/ui/card";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {breadcrumb} from "~/lib/game-links";
import {useLabel} from "~/lib/labels";
import {shopEntriesFrom, type ShopEntry, tradeEntriesFrom, type TradeEntry, tradeEventEntriesFrom} from "~/lib/trades/entries";
import {createEventFeed} from "~/lib/trades/history";
import {createClaimTradesRelay, type HistoryScope} from "~/lib/trades/relay";

type Group = {shop: ShopEntry; orders: TradeEntry[]};

function byName(a: Group, b: Group): number {
    return (a.shop.name ?? "").localeCompare(b.shop.name ?? "") || a.shop.id.localeCompare(b.shop.id);
}

export default function ClaimTradesPage() {
    const params = useParams();
    const label = useLabel();
    const claimId = createMemo(() => parseEntityId(params.id as string | undefined));
    const relay = createClaimTradesRelay(claimId);

    const claim = createMemo(() => {
        const id = claimId();
        return id === null ? undefined : relay.snapshot().claims.get(id);
    });
    const shops = createMemo(() => shopEntriesFrom(relay.snapshot()));
    const groups = createMemo(() => {
        const byShop = new Map<string, Group>();
        for (const shop of shops().values()) byShop.set(shop.id, {shop, orders: []});
        for (const order of tradeEntriesFrom(relay.snapshot(), shops())) byShop.get(order.shop.id)?.orders.push(order);
        const all = [...byShop.values()];
        return {
            byId: byShop,
            // Ids rather than groups, so `For` keeps each card mounted across snapshots.
            stalls: all.filter(group => group.shop.kind === "stall").sort(byName).map(group => group.shop.id),
            // Stowed stands have no `shop_info`, so their kind is unknown; they're still members' stands.
            stands: all.filter(group => group.shop.kind !== "stall").sort(byName).map(group => group.shop.id),
        };
    });

    const [open, setOpen] = createSignal<ReadonlySet<string>>(new Set());
    const setShopOpen = (id: string, isOpen: boolean) => {
        const next = new Set(open());
        if (isOpen) next.add(id);
        else next.delete(id);
        setOpen(next);
    };

    const scope = createMemo((): HistoryScope | null => {
        const id = claimId();
        return id === null ? null : {kind: "claim", id};
    });
    const feed = createEventFeed(scope, () => relay.snapshot().events);
    const events = createMemo(() => tradeEventEntriesFrom(feed.events(), relay.snapshot(), shops()));

    const heading = () => {
        const row = claim();
        return row ? claimDisplayName(row.name) : label(msg`Claim shops`);
    };

    const ShopList = (props: {ids: string[]}) => (
        <div class="space-y-2">
            <For each={props.ids} fallback={<p class="text-sm text-muted-foreground"><Trans>No shops.</Trans></p>}>
                {id => (
                    <Show when={groups().byId.get(id)}>
                        {group => (
                            <ShopCard
                                shop={group().shop}
                                orders={group().orders}
                                open={open().has(id)}
                                onOpenChange={isOpen => setShopOpen(id, isOpen)}
                            />
                        )}
                    </Show>
                )}
            </For>
        </div>
    );

    return (
        <MainLayout
            title={heading()}
            ownHeading
            description="A BitCraft claim's barter stalls and trader stands, with live stock and recent sales."
            navTitle={breadcrumb(TRADES_HREF)}
        >
            <div class="mx-auto max-w-5xl space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground">{heading()}</h1>
                    <Show when={claim()}>
                        {row => <span class="text-muted-foreground">{regionDisplayName(relay.snapshot().regions.get(row().regionId)?.name, row().regionId)}</span>}
                    </Show>
                    <div class="ml-auto flex flex-row gap-2">
                        <Show when={claimId() !== null}>
                            <Button variant="outline" size="sm" class="h-8" as={A} href={stockHref(String(claimId()))}>
                                <Trans>Stock manager</Trans>
                            </Button>
                        </Show>
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Show
                    when={claimId() !== null && relay.ready() && (claim() || shops().size > 0)}
                    fallback={
                        <p class="text-muted-foreground">
                            <Show when={claimId() !== null} fallback={<Trans>That is not a claim id.</Trans>}>
                                <Show when={relay.ready()} fallback={<Trans>Loading this claim…</Trans>}>
                                    <Trans>No such claim.</Trans>
                                </Show>
                            </Show>
                        </p>
                    }
                >
                    <Tabs defaultValue="stalls">
                        <TabsList>
                            <TabsTrigger value="stalls"><Trans>Barter stalls ({groups().stalls.length})</Trans></TabsTrigger>
                            <TabsTrigger value="stands"><Trans>Trader stands ({groups().stands.length})</Trans></TabsTrigger>
                        </TabsList>
                        <TabsContent value="stalls" class="space-y-4">
                            <ShopList ids={groups().stalls}/>
                            <Card>
                                <CardHeader><CardTitle><Trans>Recent trades</Trans></CardTitle></CardHeader>
                                <CardContent>
                                    <TradeEventTable
                                        name="trade-claim-events"
                                        events={events()}
                                        withShop
                                        ready={relay.ready()}
                                        historyLoaded={feed.loaded()}
                                        historyLoading={feed.loading()}
                                        onLoadHistory={feed.load}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="stands">
                            <ShopList ids={groups().stands}/>
                        </TabsContent>
                    </Tabs>
                </Show>
            </div>
        </MainLayout>
    );
}
