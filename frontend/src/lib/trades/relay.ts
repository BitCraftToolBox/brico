/**
 * relay.ts — prism resources and live snapshots for the trade finder, shop, claim and stock pages.
 *
 * Snapshots hold raw relay rows; `entries.ts` joins them with the static game data.
 */
import {tables} from "@brico/bindings/prism";
import type {ClaimInfo, PlayerState, Region, ShopInfo, ShopInventory, TradeEvent, TradeOrder} from "@brico/bindings/prism/types";
import {leadingAndTrailing, throttle} from "@solid-primitives/scheduled";
import {type Accessor, createEffect, createSignal, onCleanup} from "solid-js";
import {CRAFT_REFERENCE_RESOURCE} from "~/lib/crafts/relay";
import type {ConnectionStatus, ResourceSpec} from "~/lib/spacetime/connection";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER, type PrismConnection, type PrismQuery, prismRows, prismTable} from "~/lib/spacetime/prism";

/** How long row changes are coalesced before a snapshot is rebuilt. */
const REBUILD_INTERVAL_MS = 500;

/** Every shop, order and inventory in the game — what the finder lists. */
export const TRADE_LIST_RESOURCE: ResourceSpec<PrismQuery> = {
    key: "trades:list",
    tables: [
        prismTable(tables.tradeOrder),
        prismTable(tables.shopInfo),
        prismTable(tables.shopInventory),
    ],
};

export function tradeShopResource(shopId: bigint): ResourceSpec<PrismQuery> {
    return {
        key: `trades:shop:${shopId}`,
        tables: [
            prismRows(tables.tradeOrder, tables.tradeOrder.where(row => row.shopEntityId.eq(shopId))),
            prismRows(tables.shopInfo, tables.shopInfo.where(row => row.shopEntityId.eq(shopId))),
            prismRows(tables.shopInventory, tables.shopInventory.where(row => row.shopEntityId.eq(shopId))),
            prismRows(tables.tradeEvent, tables.tradeEvent.where(row => row.shopEntityId.eq(shopId))),
        ],
    };
}

export function tradeShopHistoryResource(shopId: bigint): ResourceSpec<PrismQuery> {
    return {
        key: `trades:shop:${shopId}:history`,
        tables: [prismRows(tables.tradeEventHistory, tables.tradeEventHistory.where(row => row.shopEntityId.eq(shopId)))],
    };
}

/** A claim's shops, their orders and inventories, and its last 24h of stall sales. */
export function tradeClaimResource(claimId: bigint): ResourceSpec<PrismQuery> {
    return {
        key: `trades:claim:${claimId}`,
        tables: [
            prismRows(tables.shopInfo, tables.shopInfo.where(row => row.claimEntityId.eq(claimId))),
            prismRows(tables.tradeOrder, tables.tradeOrder.where(row => row.claimEntityId.eq(claimId))),
            // `shop_inventory` has no claim column, so it is joined through the claim's shops.
            prismRows(
                tables.shopInventory,
                tables.shopInfo
                    .where(row => row.claimEntityId.eq(claimId))
                    .rightSemijoin(tables.shopInventory, (shop, inventory) => shop.shopEntityId.eq(inventory.shopEntityId)),
            ),
            prismRows(tables.tradeEvent, tables.tradeEvent.where(row => row.claimEntityId.eq(claimId))),
        ],
    };
}

export function tradeClaimHistoryResource(claimId: bigint): ResourceSpec<PrismQuery> {
    return {
        key: `trades:claim:${claimId}:history`,
        tables: [prismRows(tables.tradeEventHistory, tables.tradeEventHistory.where(row => row.claimEntityId.eq(claimId)))],
    };
}

export interface TradeSnapshot {
    orders: TradeOrder[];
    shops: Map<bigint, ShopInfo>;
    inventories: Map<bigint, ShopInventory>;
    /** Last 24h of sales; only barter stalls record any. */
    events: TradeEvent[];
    claims: Map<bigint, ClaimInfo>;
    players: Map<bigint, PlayerState>;
    regions: Map<number, Region>;
}

export const EMPTY_TRADE_SNAPSHOT: TradeSnapshot = {
    orders: [],
    shops: new Map(),
    inventories: new Map(),
    events: [],
    claims: new Map(),
    players: new Map(),
    regions: new Map(),
};

/** Which rows of the shared cache belong to a view. The connection is shared, so every read re-filters. */
interface TradeScope {
    shop(row: ShopInfo): boolean;
    order(row: TradeOrder): boolean;
    /** Shops whose inventories to keep, given the in-scope `shop_info` rows and orders. */
    inventory(shopId: bigint, shops: ReadonlyMap<bigint, ShopInfo>, orders: readonly TradeOrder[]): boolean;
    /** `null` skips `trade_event` entirely. */
    event: ((row: TradeEvent) => boolean) | null;
}

function readTradeSnapshot(conn: PrismConnection, scope: TradeScope): TradeSnapshot {
    const shops = new Map<bigint, ShopInfo>();
    for (const row of conn.db.shopInfo.iter() as Iterable<ShopInfo>) if (scope.shop(row)) shops.set(row.shopEntityId, row);
    const orders: TradeOrder[] = conn.db.tradeOrder.iter().filter(row => scope.order(row)).toArray();
    const inventories = new Map<bigint, ShopInventory>();
    for (const row of conn.db.shopInventory.iter() as Iterable<ShopInventory>) {
        if (scope.inventory(row.shopEntityId, shops, orders)) inventories.set(row.shopEntityId, row);
    }
    const eventFilter = scope.event;
    const events: TradeEvent[] = eventFilter ? conn.db.tradeEvent.iter().filter(eventFilter).toArray() : [];

    const claims = new Map<bigint, ClaimInfo>();
    for (const row of conn.db.claimInfo.iter()) claims.set(row.entityId, row);
    const players = new Map<bigint, PlayerState>();
    for (const row of conn.db.playerState.iter()) players.set(row.entityId, row);
    const regions = new Map<number, Region>();
    for (const row of conn.db.region.iter()) regions.set(row.id, row);

    return {orders, shops, inventories, events, claims, players, regions};
}

export interface TradeRelay<T> {
    snapshot: Accessor<T>;
    /** True once every resource this view requested has applied — not `status()`, see docs/SPACETIME.md. */
    ready: Accessor<boolean>;
    status: Accessor<ConnectionStatus>;
    error: Accessor<string | null>;
    reconnect: () => void;
}

/**
 * Requests `specsFor(key)` whenever `key` changes (nothing while it is `null`) and keeps a throttled
 * snapshot read from the cache. Requests happen in an effect, so SSR never dials.
 */
function createPrismView<K, T>(
    key: Accessor<K | null>,
    specsFor: (key: K) => ResourceSpec<PrismQuery>[],
    read: (conn: PrismConnection, key: K) => T,
    empty: T,
): TradeRelay<T> {
    const [snapshot, setSnapshot] = createSignal<T>(empty);
    const [ready, setReady] = createSignal(false);
    const connection = useConnection(PRISM_SERVER);

    createEffect(() => {
        const current = key();
        setSnapshot(() => empty);
        setReady(false);
        if (current === null) return;

        const rebuild = () => {
            const conn = connection.active();
            if (conn) setSnapshot(() => read(conn, current));
        };
        const scheduleRebuild = leadingAndTrailing(throttle, rebuild, REBUILD_INTERVAL_MS);
        onCleanup(() => scheduleRebuild.clear());

        const requests = specsFor(current).map(spec => connection.requestResource(spec, scheduleRebuild));
        createEffect(() => {
            const isReady = requests.every(request => request.ready());
            // The throttle may be mid-cooldown when the last resource applies; rebuild now so
            // `ready` never reports true over an empty snapshot.
            if (isReady) rebuild();
            setReady(isReady);
        });
    });

    return {snapshot, ready, status: connection.status, error: connection.error, reconnect: connection.reconnect};
}

const ALWAYS = () => true as const;

/** Every shop and order, for the finder. Events are not subscribed. */
export function createTradeRelay(): TradeRelay<TradeSnapshot> {
    return createPrismView(
        () => true,
        () => [CRAFT_REFERENCE_RESOURCE, TRADE_LIST_RESOURCE],
        conn => readTradeSnapshot(conn, {shop: ALWAYS, order: ALWAYS, inventory: ALWAYS, event: null}),
        EMPTY_TRADE_SNAPSHOT,
    );
}

export function createShopRelay(shopId: Accessor<bigint | null>): TradeRelay<TradeSnapshot> {
    return createPrismView(
        shopId,
        id => [CRAFT_REFERENCE_RESOURCE, tradeShopResource(id)],
        (conn, id) => readTradeSnapshot(conn, {
            shop: row => row.shopEntityId === id,
            order: row => row.shopEntityId === id,
            inventory: shop => shop === id,
            event: row => row.shopEntityId === id,
        }),
        EMPTY_TRADE_SNAPSHOT,
    );
}

/** One claim's shops and sales; shared by the claim page and the stock manager. */
export function createClaimTradesRelay(claimId: Accessor<bigint | null>): TradeRelay<TradeSnapshot> {
    return createPrismView(
        claimId,
        id => [CRAFT_REFERENCE_RESOURCE, tradeClaimResource(id)],
        (conn, id) => readTradeSnapshot(conn, {
            shop: row => row.claimEntityId === id,
            order: row => row.claimEntityId === id,
            inventory: (shop, shops) => shops.has(shop),
            event: row => row.claimEntityId === id,
        }),
        EMPTY_TRADE_SNAPSHOT,
    );
}

export type HistoryScope = {kind: "shop" | "claim"; id: bigint};

/**
 * Full sale history for a shop or claim, requested only while `scope` is non-null (set it from the
 * "load full history" action). History includes the last 24h, so it replaces `trade_event` rows.
 */
export function createTradeHistory(scope: Accessor<HistoryScope | null>): TradeRelay<TradeEvent[]> {
    return createPrismView(
        scope,
        s => [s.kind === "shop" ? tradeShopHistoryResource(s.id) : tradeClaimHistoryResource(s.id)],
        (conn, s): TradeEvent[] => conn.db.tradeEventHistory.iter()
            .filter(row => (s.kind === "shop" ? row.shopEntityId : row.claimEntityId) === s.id)
            .toArray(),
        [] as TradeEvent[],
    );
}
