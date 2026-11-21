/**
 * goods.ts — item/cargo identity for trade orders and shop inventories.
 *
 * Types are structural so prism relay rows, upstream game rows and test fixtures all fit.
 */

export type ItemKind = "Item" | "Cargo";

/** The slice of an `ItemStack` this package reads. */
export interface StackLike {
    itemId: number;
    quantity: number;
    itemType: {tag: ItemKind};
}

/** Hex coins: upstream `TradeOrderState::MARKET_MODE_CURRENCY_ID`, always `ItemType::Item`. */
export const HEX_COIN_ITEM_ID = 1;

/** One item or cargo id, as a map key: `"item:123"` / `"cargo:45"`. */
export type GoodKey = `item:${number}` | `cargo:${number}`;

export const HEX_COIN_KEY: GoodKey = `item:${HEX_COIN_ITEM_ID}`;

export function goodKey(kind: ItemKind, itemId: number): GoodKey {
    return kind === "Cargo" ? `cargo:${itemId}` : `item:${itemId}`;
}

export function stackKey(stack: StackLike): GoodKey {
    return goodKey(stack.itemType.tag, stack.itemId);
}

export function parseGoodKey(key: string): {kind: ItemKind; itemId: number} | null {
    const match = /^(item|cargo):(-?\d+)$/.exec(key);
    if (!match) return null;
    return {kind: match[1] === "cargo" ? "Cargo" : "Item", itemId: Number(match[2])};
}

export function isHexCoin(stack: StackLike): boolean {
    return stack.itemType.tag === "Item" && stack.itemId === HEX_COIN_ITEM_ID;
}

/** Total quantity per good, skipping non-positive quantities. */
export function sumStacks(stacks: readonly StackLike[]): Map<GoodKey, number> {
    const totals = new Map<GoodKey, number>();
    for (const stack of stacks) {
        if (stack.quantity <= 0) continue;
        const key = stackKey(stack);
        totals.set(key, (totals.get(key) ?? 0) + stack.quantity);
    }
    return totals;
}
