/**
 * stock.ts — feeds a claim's relay snapshot into `@brico/trades/stock-plan`.
 */
import type {ItemStack} from "@brico/bindings/prism/types";
import {type GoodKey, parseGoodKey} from "@brico/trades/goods";
import type {StockConfig} from "@brico/trades/stock-config";
import {buildStockLines, type LinkSuggestion, type StockLine, type StockPlanInput, suggestLinks} from "@brico/trades/stock-plan";
import {gameVolumes, type ShopEntry} from "~/lib/trades/entries";
import type {TradeSnapshot} from "~/lib/trades/relay";

/** The claim's barter stalls; trader stands belong to members, not the claim. */
export function claimStalls(shops: ReadonlyMap<bigint, ShopEntry>, claimId: string): ShopEntry[] {
    return [...shops.values()].filter(shop => shop.kind === "stall" && shop.claimId === claimId);
}

function planInput(snapshot: TradeSnapshot, stalls: readonly ShopEntry[], config: StockConfig, nowMs: number): StockPlanInput {
    return {
        shops: stalls.map(shop => ({id: shop.id, inventory: shop.inventory, rules: shop.rules})),
        orders: snapshot.orders.map(order => ({...order, id: order.id.toString(), shopId: order.shopEntityId.toString()})),
        events: snapshot.events.map(event => ({
            shopId: event.shopEntityId.toString(),
            timestampMs: Number(event.timestamp.toMillis()),
            addedItems: event.addedItems,
            removedItems: event.removedItems,
        })),
        config,
        volumeOf: gameVolumes(),
        nowMs,
    };
}

export function stockPlan(snapshot: TradeSnapshot, stalls: readonly ShopEntry[], config: StockConfig, nowMs: number): {lines: StockLine[]; suggestions: LinkSuggestion[]} {
    const input = planInput(snapshot, stalls, config, nowMs);
    return {lines: buildStockLines(input), suggestions: suggestLinks(input)};
}

/** A display stack for one good. */
export function goodStack(good: GoodKey, quantity = 1): ItemStack | null {
    const parsed = parseGoodKey(good);
    return parsed ? {itemId: parsed.itemId, quantity, itemType: {tag: parsed.kind}, durability: undefined} : null;
}
