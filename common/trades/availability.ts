/**
 * availability.ts — how many times a shop's trade order can be accepted right now.
 *
 * Mirrors upstream `barter_stall_order_accept` (offered goods must be in the shop; the shop must
 * have room for what it receives) and `InventoryState::remove` / `add_partial`. Durability and
 * pocket `locked` flags are ignored: no shop item has durability and `locked` only applies to
 * player-to-player trade windows. Revisit if either starts applying to shops.
 */
import {type GoodKey, HEX_COIN_KEY, isHexCoin, type ItemKind, stackKey, type StackLike, sumStacks} from "./goods.ts";

/** `remaining_stock` value meaning "no limit" (upstream `i32::MAX`); such orders never decrement. */
export const UNLIMITED_STOCK = 2_147_483_647;

export interface PocketLike {
    volume: number;
    contents?: StackLike | null;
}

/** Pockets before `cargoIndex` hold items, the rest cargo (prism `shop_inventory`). */
export interface InventoryLike {
    pockets: readonly PocketLike[];
    cargoIndex: number;
}

export interface OrderLike {
    remainingStock: number;
    offerItems: readonly StackLike[];
    requiredItems: readonly StackLike[];
}

export interface ShopRules {
    /**
     * Claimed barter stalls pay hex coins from inventory then the claim treasury, and send coins
     * received to the treasury. The treasury isn't mirrored, so it is assumed to always cover payouts.
     */
    coinsFromTreasury: boolean;
}

/** Whether a shop settles hex coins through its claim's treasury (claimed barter stalls only). */
export function coinsFromTreasury(shopKind: "BarterStall" | "TraderStand" | "Unknown", claimEntityId: bigint): boolean {
    return shopKind === "BarterStall" && claimEntityId !== 0n;
}

/** Total quantity of each good across an inventory's pockets. */
export function inventoryCounts(inventory: InventoryLike | null | undefined): Map<GoodKey, number> {
    const stacks: StackLike[] = [];
    for (const pocket of inventory?.pockets ?? []) if (pocket.contents) stacks.push(pocket.contents);
    return sumStacks(stacks);
}

export interface OrderCapacity {
    /** Trades acceptable now; `null` = unlimited. */
    trades: number | null;
    /** What caps `trades`: the owner's stock limit or the shop's inventory; `null` when unlimited. */
    limitedBy: "stock" | "inventory" | null;
    /** Offered goods the shop holds less than one trade's worth of. */
    missing: GoodKey[];
}

export function orderCapacity(order: OrderLike, counts: ReadonlyMap<GoodKey, number>, rules: ShopRules): OrderCapacity {
    const stockLimit = order.remainingStock === UNLIMITED_STOCK ? null : Math.max(order.remainingStock, 0);
    let inventoryLimit: number | null = null;
    const missing: GoodKey[] = [];
    for (const [key, quantity] of offeredGoods(order, rules)) {
        const fits = Math.floor((counts.get(key) ?? 0) / quantity);
        if (fits === 0) missing.push(key);
        inventoryLimit = inventoryLimit === null ? fits : Math.min(inventoryLimit, fits);
    }

    if (stockLimit === null && inventoryLimit === null) return {trades: null, limitedBy: null, missing};
    if (inventoryLimit === null || (stockLimit !== null && stockLimit <= inventoryLimit)) {
        return {trades: stockLimit, limitedBy: "stock", missing};
    }
    return {trades: inventoryLimit, limitedBy: "inventory", missing};
}

/** Offered goods the shop's inventory must cover, per trade. */
function offeredGoods(order: OrderLike, rules: ShopRules): Map<GoodKey, number> {
    const goods = sumStacks(order.offerItems);
    if (rules.coinsFromTreasury) goods.delete(HEX_COIN_KEY);
    return goods;
}

/** Item or cargo volume from game data (`ItemDesc.volume` / `CargoDesc.volume`). */
export type VolumeOf = (kind: ItemKind, itemId: number) => number | undefined;

interface SimPocket {
    volume: number;
    key: GoodKey | null;
    quantity: number;
    cargo: boolean;
}

/**
 * Whether the shop has room for what it receives from `amount` trades at once, assuming the
 * offered goods are present. Offered goods are removed first, as upstream does.
 * Goods with unknown volume are assumed to fit, so missing game data never reads as "full".
 */
export function fitsTrades(order: OrderLike, inventory: InventoryLike | null | undefined, volumeOf: VolumeOf, rules: ShopRules, amount: number): boolean {
    if (amount <= 0) return true;
    const pockets: SimPocket[] = (inventory?.pockets ?? []).map((pocket, index) => ({
        volume: pocket.volume,
        key: pocket.contents && pocket.contents.quantity > 0 ? stackKey(pocket.contents) : null,
        quantity: pocket.contents?.quantity ?? 0,
        cargo: index >= (inventory?.cargoIndex ?? 0),
    }));

    for (const stack of order.offerItems) {
        if (stack.quantity > 0) removeFromPockets(pockets, stackKey(stack), stack.quantity * amount);
    }
    for (const stack of order.requiredItems) {
        if (stack.quantity <= 0) continue;
        if (rules.coinsFromTreasury && isHexCoin(stack)) continue;
        if (!addToPockets(pockets, stack, stack.quantity * amount, volumeOf)) return false;
    }
    return true;
}

/** Most trades (up to `upTo`) whose received goods fit in the shop at once. */
export function roomFor(order: OrderLike, inventory: InventoryLike | null | undefined, volumeOf: VolumeOf, rules: ShopRules, upTo = 1): number {
    if (fitsTrades(order, inventory, volumeOf, rules, upTo)) return upTo;
    let low = 0;
    let high = upTo;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (fitsTrades(order, inventory, volumeOf, rules, mid)) low = mid;
        else high = mid;
    }
    return low;
}

/** Upstream `InventoryState::remove`: always draws from the smallest matching pocket. Removes what exists. */
function removeFromPockets(pockets: SimPocket[], key: GoodKey, quantity: number) {
    let left = quantity;
    while (left > 0) {
        let smallest: SimPocket | null = null;
        for (const pocket of pockets) {
            if (pocket.key === key && (smallest === null || pocket.quantity < smallest.quantity)) smallest = pocket;
        }
        if (!smallest) return;
        const taken = Math.min(smallest.quantity, left);
        smallest.quantity -= taken;
        left -= taken;
        if (smallest.quantity === 0) smallest.key = null;
    }
}

/** Upstream `InventoryState::add_partial`: top up matching pockets, then fill empty ones of the right half. */
function addToPockets(pockets: SimPocket[], stack: StackLike, quantity: number, volumeOf: VolumeOf): boolean {
    const key = stackKey(stack);
    const cargo = stack.itemType.tag === "Cargo";
    const volume = volumeOf(stack.itemType.tag, stack.itemId);
    if (volume === undefined) return true;
    const canFit = (pocket: SimPocket) =>
        pocket.volume <= 0 || volume <= 0 ? Infinity : Math.floor((pocket.volume - pocket.quantity * volume) / volume);

    let left = quantity;
    for (const pocket of pockets) {
        if (left === 0) return true;
        if (pocket.key !== key) continue;
        const added = Math.max(Math.min(canFit(pocket), left), 0);
        pocket.quantity += added;
        left -= added;
    }
    for (const pocket of pockets) {
        if (left === 0) return true;
        if (pocket.key !== null || pocket.cargo !== cargo) continue;
        const added = Math.max(Math.min(canFit(pocket), left), 0);
        if (added === 0) continue;
        pocket.key = key;
        pocket.quantity = added;
        left -= added;
    }
    return left === 0;
}
