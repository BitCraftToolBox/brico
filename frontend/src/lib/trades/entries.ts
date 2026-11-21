/**
 * entries.ts — joins a relay `TradeSnapshot` with the static game data into display/filter rows.
 *
 * Reads game tables through their `indexedBy` accessors, so calling these inside a memo stays
 * reactive to the game data loading and to data-locale switches.
 */
import type {ItemStack, ShopInfo, ShopInventory, TradeEvent, TradeOrder} from "@brico/bindings/prism/types";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {coinsFromTreasury, inventoryCounts, orderCapacity, type OrderCapacity, roomFor, type ShopRules, UNLIMITED_STOCK, type VolumeOf,} from "@brico/trades/availability";
import {classifyOrder, type OrderClass} from "@brico/trades/classify";
import {type GoodKey, stackKey} from "@brico/trades/goods";
import {BitCraftTables} from "~/lib/bitcraft-data";
import type {TradeSnapshot} from "~/lib/trades/relay";

export type ShopKind = "stall" | "stand" | "unknown";

export interface ShopEntry {
    /** Shop entity id as a decimal string — route param and row key. */
    id: string;
    entityId: bigint;
    /** The player-set name, else the building/deployable type name; `null` when neither is known. */
    name: string | null;
    kind: ShopKind;
    /** `"building:<id>"` / `"deployable:<id>"`, `null` for unknown shops. */
    typeKey: string | null;
    typeName: string | null;
    claimId: string | null;
    claimName: string | null;
    ownerId: string | null;
    ownerName: string | null;
    regionId: number;
    regionName: string;
    /** Whether the shop is in the world (has a `shop_info` row). Stowed stands keep their orders. */
    placed: boolean;
    rules: ShopRules;
    inventory: ShopInventory | null;
    counts: ReadonlyMap<GoodKey, number>;
}

/**
 * Why an order can or can't be traded right now. "Full" (no room for what the shop receives) is
 * separate: the trade works again once the owner makes room, so it never hides an order.
 */
export type OrderStatus = "available" | "limit" | "inventory" | "inactive";

export interface TradeEntry {
    /** Order entity id as a decimal string. Changes when the owner edits the order in game. */
    id: string;
    shop: ShopEntry;
    offer: ItemStack[];
    request: ItemStack[];
    offerKeys: GoodKey[];
    requestKeys: GoodKey[];
    /** `null` = unlimited. */
    remainingStock: number | null;
    capacity: OrderCapacity;
    status: OrderStatus;
    full: boolean;
    classification: OrderClass;
}

export interface TradeEventEntry {
    id: string;
    timestampMs: number;
    shop: ShopEntry | null;
    actorId: string;
    actorName: string | null;
    orderId: string | null;
    amount: number | null;
    /** What the player got: the stall's net removed items. */
    received: ItemStack[];
    /** What the player gave: the stall's net added items. */
    given: ItemStack[];
    treasuryIn: number;
    treasuryOut: number;
}

function optionalId(id: bigint): string | null {
    return id === 0n ? null : id.toString();
}

/** Item/cargo volume lookup over the loaded game data. */
export function gameVolumes(): VolumeOf {
    const items = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargo = BitCraftTables.CargoDesc.indexedBy("id")();
    return (kind, itemId) => (kind === "Cargo" ? cargo.get(itemId) : items.get(itemId))?.volume;
}

function shopEntry(
    entityId: bigint,
    info: ShopInfo | undefined,
    fallback: {claimEntityId: bigint; regionId: number},
    snapshot: TradeSnapshot,
): ShopEntry {
    const buildings = BitCraftTables.BuildingDesc.indexedBy("id")();
    const deployables = BitCraftTables.DeployableDesc.indexedBy("id")();
    const type = info?.shopType;
    const kind: ShopKind = type?.tag === "BarterStall" ? "stall" : type?.tag === "TraderStand" ? "stand" : "unknown";
    const typeName = kind === "stall" ? buildings.get(type!.value)?.name ?? null
        : kind === "stand" ? deployables.get(type!.value)?.name ?? null
            : null;
    const claimEntityId = info?.claimEntityId ?? fallback.claimEntityId;
    const regionId = info?.regionId ?? fallback.regionId;
    const claim = claimEntityId === 0n ? undefined : snapshot.claims.get(claimEntityId);
    const owner = info && info.playerOwnerId !== 0n ? snapshot.players.get(info.playerOwnerId) : undefined;
    const inventory = snapshot.inventories.get(entityId) ?? null;
    return {
        id: entityId.toString(),
        entityId,
        name: info?.shopName.trim() || typeName,
        kind,
        typeKey: kind === "stall" ? `building:${type!.value}` : kind === "stand" ? `deployable:${type!.value}` : null,
        typeName,
        claimId: optionalId(claimEntityId),
        claimName: claim ? claimDisplayName(claim.name) : null,
        ownerId: info ? optionalId(info.playerOwnerId) : null,
        ownerName: owner?.name ?? null,
        regionId,
        regionName: regionDisplayName(snapshot.regions.get(regionId)?.name, regionId),
        placed: info !== undefined,
        rules: {coinsFromTreasury: coinsFromTreasury(type?.tag ?? "Unknown", claimEntityId)},
        inventory,
        counts: inventoryCounts(inventory),
    };
}

/** Every shop in the snapshot, including unplaced ones that only appear through their orders. */
export function shopEntriesFrom(snapshot: TradeSnapshot): Map<bigint, ShopEntry> {
    const shops = new Map<bigint, ShopEntry>();
    for (const info of snapshot.shops.values()) shops.set(info.shopEntityId, shopEntry(info.shopEntityId, info, info, snapshot));
    for (const order of snapshot.orders) {
        if (!shops.has(order.shopEntityId)) shops.set(order.shopEntityId, shopEntry(order.shopEntityId, undefined, order, snapshot));
    }
    return shops;
}

function orderStatus(order: TradeOrder, shop: ShopEntry, capacity: OrderCapacity): OrderStatus {
    if (!order.active || !shop.placed) return "inactive";
    if (capacity.trades === 0) return capacity.limitedBy === "stock" ? "limit" : "inventory";
    return "available";
}

export function tradeEntriesFrom(snapshot: TradeSnapshot, shops: ReadonlyMap<bigint, ShopEntry>): TradeEntry[] {
    const volumes = gameVolumes();
    return snapshot.orders.map(order => {
        const shop = shops.get(order.shopEntityId)!;
        const capacity = orderCapacity(order, shop.counts, shop.rules);
        return {
            id: order.id.toString(),
            shop,
            offer: order.offerItems,
            request: order.requiredItems,
            offerKeys: order.offerItems.map(stackKey),
            requestKeys: order.requiredItems.map(stackKey),
            remainingStock: order.remainingStock === UNLIMITED_STOCK ? null : order.remainingStock,
            capacity,
            status: orderStatus(order, shop, capacity),
            full: roomFor(order, shop.inventory, volumes, shop.rules) === 0,
            classification: classifyOrder(order),
        } satisfies TradeEntry;
    });
}

/** Newest first. */
export function tradeEventEntriesFrom(events: readonly TradeEvent[], snapshot: TradeSnapshot, shops: ReadonlyMap<bigint, ShopEntry>): TradeEventEntry[] {
    return events
        .map(event => ({
            id: event.id.toString(),
            timestampMs: Number(event.timestamp.toMillis()),
            shop: shops.get(event.shopEntityId) ?? null,
            actorId: event.actorEntityId.toString(),
            actorName: snapshot.players.get(event.actorEntityId)?.name ?? null,
            orderId: event.tradeOrderEntityId?.toString() ?? null,
            amount: event.tradeAmount ?? null,
            received: event.removedItems,
            given: event.addedItems,
            treasuryIn: event.treasuryCoinsAdded,
            treasuryOut: event.treasuryCoinsRemoved,
        }) satisfies TradeEventEntry)
        .sort((a, b) => b.timestampMs - a.timestampMs);
}
