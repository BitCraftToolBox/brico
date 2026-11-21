/**
 * classify.ts — reads a trade order as a coin purchase, a coin sale, or a plain barter.
 *
 * Directions are from the shop's side: a "buy" order pays coins for a good (players sell to it),
 * a "sell" order gives a good for coins (players buy from it).
 */
import {type GoodKey, HEX_COIN_KEY, type StackLike, sumStacks} from "./goods.ts";

export type OrderClass =
    | {kind: "buy" | "sell"; good: GoodKey; goodQuantity: number; coins: number; unitPrice: number}
    | {kind: "barter"};

export function classifyOrder(order: {offerItems: readonly StackLike[]; requiredItems: readonly StackLike[]}): OrderClass {
    const offer = sumStacks(order.offerItems);
    const required = sumStacks(order.requiredItems);
    const buy = coinTrade(offer, required);
    if (buy) return {kind: "buy", ...buy};
    const sell = coinTrade(required, offer);
    if (sell) return {kind: "sell", ...sell};
    return {kind: "barter"};
}

/** `coinSide` holds only coins and `goodSide` exactly one non-coin good. */
function coinTrade(coinSide: Map<GoodKey, number>, goodSide: Map<GoodKey, number>) {
    const coins = coinSide.get(HEX_COIN_KEY);
    if (coins === undefined || coinSide.size !== 1 || goodSide.size !== 1) return null;
    const [[good, goodQuantity]] = goodSide;
    if (good === HEX_COIN_KEY) return null;
    return {good, goodQuantity, coins, unitPrice: coins / goodQuantity};
}
