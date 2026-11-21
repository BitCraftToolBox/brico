/**
 * [id].tsx — one shop: its details, every order (tradeable or not), its inventory and, for barter
 * stalls, its sales.
 */
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {LiveTable} from "~/components/data-table/live-table";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import {ShopInventoryView} from "~/components/trades/ShopInventoryView";
import {tradeColumns} from "~/components/trades/trade-columns";
import {ClaimLink, parseEntityId, shopLabel, TRADES_HREF} from "~/components/trades/TradeBits";
import {TradeEventTable} from "~/components/trades/TradeEventTable";
import {Badge} from "~/components/ui/badge";
import {Card, CardContent, CardHeader, CardTitle} from "~/components/ui/card";
import {breadcrumb} from "~/lib/game-links";
import {useLabel} from "~/lib/labels";
import {shopEntriesFrom, tradeEntriesFrom, tradeEventEntriesFrom} from "~/lib/trades/entries";
import {createEventFeed} from "~/lib/trades/history";
import {createShopRelay, type HistoryScope} from "~/lib/trades/relay";

const ORDER_COLUMNS = tradeColumns(false);

export default function ShopPage() {
    const params = useParams();
    const label = useLabel();
    const shopId = createMemo(() => parseEntityId(params.id as string | undefined));
    const relay = createShopRelay(shopId);

    const shops = createMemo(() => shopEntriesFrom(relay.snapshot()));
    const shop = createMemo(() => {
        const id = shopId();
        return id === null ? null : shops().get(id) ?? null;
    });
    const orders = createMemo(() => tradeEntriesFrom(relay.snapshot(), shops()));

    const scope = createMemo((): HistoryScope | null => {
        const id = shopId();
        return id === null ? null : {kind: "shop", id};
    });
    const feed = createEventFeed(scope, () => relay.snapshot().events);
    const events = createMemo(() => tradeEventEntriesFrom(feed.events(), relay.snapshot(), shops()));

    const heading = () => {
        const entry = shop();
        return entry ? shopLabel(entry, label) : label(msg`Shop`);
    };

    return (
        <MainLayout
            title={heading()}
            ownHeading
            description="A live BitCraft shop: its trade offers, stock and recent sales."
            navTitle={breadcrumb(TRADES_HREF)}
        >
            <div class="mx-auto max-w-5xl space-y-4 px-4 pb-8">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="text-3xl font-bold text-foreground">{heading()}</h1>
                    <Show when={shop()}>
                        {entry => (
                            <>
                                <Show when={entry().typeName}>{name => <Badge variant="secondary">{name()}</Badge>}</Show>
                                <Show when={!entry().placed}><Badge variant="secondary"><Trans>not placed</Trans></Badge></Show>
                            </>
                        )}
                    </Show>
                    <div class="ml-auto flex flex-row gap-2">
                        <ConnectionStatusBadge connections={[relay]}/>
                    </div>
                </div>

                <Show
                    when={shop()}
                    fallback={
                        <p class="text-muted-foreground">
                            <Show when={shopId() !== null} fallback={<Trans>That is not a shop id.</Trans>}>
                                <Show when={relay.ready()} fallback={<Trans>Loading this shop…</Trans>}>
                                    <Trans>No such shop. It may have been removed, or a stowed trader stand without orders.</Trans>
                                </Show>
                            </Show>
                        </p>
                    }
                >
                    {entry => (
                        <>
                            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt class="text-muted-foreground"><Trans>Claim</Trans></dt>
                                <dd><ClaimLink shop={entry()}/></dd>
                                <Show when={entry().kind === "stand"}>
                                    <dt class="text-muted-foreground"><Trans>Owner</Trans></dt>
                                    <dd>{entry().ownerName ?? "—"}</dd>
                                </Show>
                                <dt class="text-muted-foreground"><Trans>Region</Trans></dt>
                                <dd>{entry().regionName}</dd>
                            </dl>
                            <Show when={!entry().placed}>
                                <p class="text-sm text-muted-foreground">
                                    <Trans>This shop isn't in the world right now (a stowed trader stand), so its orders can't be traded.</Trans>
                                </p>
                            </Show>

                            <Card>
                                <CardHeader><CardTitle><Trans>Trade orders</Trans></CardTitle></CardHeader>
                                <CardContent>
                                    <LiveTable
                                        name="trade-shop-orders"
                                        columns={ORDER_COLUMNS}
                                        data={orders()}
                                        getRowId={order => order.id}
                                        empty={<Trans>This shop has no trade orders.</Trans>}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader><CardTitle><Trans>Inventory</Trans></CardTitle></CardHeader>
                                <CardContent><ShopInventoryView inventory={entry().inventory}/></CardContent>
                            </Card>

                            <Show when={entry().kind === "stall"}>
                                <Card>
                                    <CardHeader><CardTitle><Trans>Recent trades</Trans></CardTitle></CardHeader>
                                    <CardContent>
                                        <TradeEventTable
                                            name="trade-shop-events"
                                            events={events()}
                                            withShop={false}
                                            ready={relay.ready()}
                                            historyLoaded={feed.loaded()}
                                            historyLoading={feed.loading()}
                                            onLoadHistory={feed.load}
                                        />
                                    </CardContent>
                                </Card>
                            </Show>
                        </>
                    )}
                </Show>
            </div>
        </MainLayout>
    );
}
