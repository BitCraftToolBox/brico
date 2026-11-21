/**
 * stock-plan.ts — per-good restock status for a claim's barter stalls.
 *
 * A line pairs the buy orders for one good in an intake stall with the sell orders for it in an
 * outlet stall (the same stall when they aren't linked). Buy/sell are from the stall's side: a
 * buy order pays coins for the good, a sell order gives the good for coins.
 */
import {inventoryCounts, type InventoryLike, orderCapacity, type OrderCapacity, type OrderLike, roomFor, type ShopRules, UNLIMITED_STOCK, type VolumeOf} from "./availability.ts";
import {classifyOrder} from "./classify.ts";
import {type GoodKey, stackKey, type StackLike} from "./goods.ts";
import {overrideKey, type StockConfig, type StockOverride, type StockThresholds} from "./stock-config.ts";

export interface StockShop {
    id: string;
    inventory: InventoryLike | null;
    rules: ShopRules;
}

export interface StockOrder extends OrderLike {
    id: string;
    shopId: string;
    active: boolean;
}

export interface StockEvent {
    shopId: string;
    timestampMs: number;
    addedItems: readonly StackLike[];
    removedItems: readonly StackLike[];
}

export interface StockPlanInput {
    /** The claim's barter stalls; other shops' orders are ignored. */
    shops: readonly StockShop[];
    orders: readonly StockOrder[];
    events: readonly StockEvent[];
    config: StockConfig;
    volumeOf: VolumeOf;
    nowMs: number;
}

export interface StockLineOrder {
    id: string;
    /** Trades left; `null` = unlimited. */
    remaining: number | null;
    goodQuantity: number;
    unitPrice: number;
    capacity: OrderCapacity;
    /** 1 when one more trade's received goods fit in the stall, else 0. */
    room: number;
}

export type StockIssue =
    | {kind: "missing-order"}
    | {kind: "move"; quantity: number}
    | {kind: "intake-full"}
    | {kind: "reset-buy"; limit: number | null}
    | {kind: "sell-limit"}
    | {kind: "sold-out"}
    | {kind: "holding"};

/** Issues the claim owner has to act on; `sold-out` and `holding` are informational. */
export const ACTION_ISSUES: ReadonlySet<StockIssue["kind"]> = new Set(["missing-order", "move", "intake-full", "reset-buy", "sell-limit"]);

export type ThresholdSource = "override" | "claim" | "default";

export interface EffectiveThresholds {
    batchSize: number | null;
    reorderAt: number;
    outletLowAt: number;
    outletTarget: number | null;
    sources: Record<keyof StockThresholds, ThresholdSource>;
}

export interface StockLine {
    /** Stable across order edits: `${intake}>${outlet}|${good}`. */
    key: string;
    good: GoodKey;
    intakeShopId: string;
    outletShopId: string;
    linked: boolean;
    buyOrders: StockLineOrder[];
    sellOrders: StockLineOrder[];
    /** Sum of buy order trades left; `null` when any is unlimited. */
    buyRemaining: number | null;
    intakeOnHand: number;
    /** Same as `intakeOnHand` for an unlinked line. */
    outletOnHand: number;
    onHand: number;
    /** Units the intake bought / the outlet sold in the last 24h. */
    bought24h: number;
    sold24h: number;
    /** Outlet on-hand ÷ the last 24h's hourly sell rate; `null` without sales. */
    hoursToEmpty: number | null;
    /** Lowest sell price minus highest buy price per unit; `null` unless both sides exist. */
    spread: number | null;
    thresholds: EffectiveThresholds;
    ignored: boolean;
    issues: StockIssue[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveThresholds(config: StockConfig, intake?: StockOverride, outlet?: StockOverride): EffectiveThresholds {
    const sources = {} as Record<keyof StockThresholds, ThresholdSource>;
    const pick = <K extends keyof StockThresholds>(field: K, override: StockOverride | undefined, fallback: number | null) => {
        if (override?.[field] !== undefined) {
            sources[field] = "override";
            return override[field]!;
        }
        if (config.defaults[field] !== undefined) {
            sources[field] = "claim";
            return config.defaults[field]!;
        }
        sources[field] = "default";
        return fallback;
    };
    return {
        batchSize: pick("batchSize", intake, null),
        reorderAt: pick("reorderAt", intake, 0)!,
        outletLowAt: pick("outletLowAt", outlet, 0)!,
        outletTarget: pick("outletTarget", outlet, null),
        sources,
    };
}

type Side = Map<string, Map<GoodKey, StockLineOrder[]>>;

function listIn<K, V>(map: Map<K, V[]>, key: K): V[] {
    let list = map.get(key);
    if (!list) map.set(key, list = []);
    return list;
}

function push(side: Side, shopId: string, good: GoodKey, order: StockLineOrder) {
    let goods = side.get(shopId);
    if (!goods) side.set(shopId, goods = new Map());
    listIn(goods, good).push(order);
}

export function buildStockLines(input: StockPlanInput): StockLine[] {
    const {config} = input;
    const shops = new Map(input.shops.map(shop => [shop.id, shop]));
    const counts = new Map(input.shops.map(shop => [shop.id, inventoryCounts(shop.inventory)]));

    const buys: Side = new Map();
    const sells: Side = new Map();
    for (const order of input.orders) {
        const shop = shops.get(order.shopId);
        if (!shop || !order.active) continue;
        const kind = classifyOrder(order);
        if (kind.kind === "barter") continue;
        const line: StockLineOrder = {
            id: order.id,
            remaining: order.remainingStock === UNLIMITED_STOCK ? null : order.remainingStock,
            goodQuantity: kind.goodQuantity,
            unitPrice: kind.unitPrice,
            capacity: orderCapacity(order, counts.get(shop.id)!, shop.rules),
            room: roomFor(order, shop.inventory, input.volumeOf, shop.rules),
        };
        push(kind.kind === "buy" ? buys : sells, shop.id, kind.good, line);
    }

    const outletsOf = new Map<string, string[]>();
    const intakesOf = new Map<string, string[]>();
    for (const link of config.links) {
        if (!shops.has(link.intakeShopId) || !shops.has(link.outletShopId) || link.intakeShopId === link.outletShopId) continue;
        listIn(outletsOf, link.intakeShopId).push(link.outletShopId);
        listIn(intakesOf, link.outletShopId).push(link.intakeShopId);
    }

    const pairs = new Map<string, {intake: string; outlet: string; good: GoodKey}>();
    const addPair = (intake: string, outlet: string, good: GoodKey) => pairs.set(`${intake}>${outlet}|${good}`, {intake, outlet, good});
    const covered = (shopId: string, good: GoodKey) =>
        [...pairs.values()].some(pair => pair.good === good && (pair.intake === shopId || pair.outlet === shopId));

    // Buy orders pair with each linked outlet selling the good (and the stall itself, if it sells it too).
    for (const [intake, goods] of buys) {
        for (const good of goods.keys()) {
            const outlets = (outletsOf.get(intake) ?? []).filter(outlet => sells.get(outlet)?.has(good));
            if (sells.get(intake)?.has(good)) outlets.push(intake);
            if (outlets.length === 0) outlets.push(outletsOf.get(intake)?.[0] ?? intake);
            for (const outlet of outlets) addPair(intake, outlet, good);
        }
    }
    // Sell orders nothing buys for: pair with a linked intake (to see what can move over) or themselves.
    for (const [outlet, goods] of sells) {
        for (const good of goods.keys()) {
            if (!covered(outlet, good)) addPair(intakesOf.get(outlet)?.[0] ?? outlet, outlet, good);
        }
    }
    // Overrides with no orders at all left (e.g. both sides gone).
    for (const key of Object.keys(config.overrides)) {
        const [shopId, good] = key.split("|") as [string, GoodKey];
        if (!shops.has(shopId) || covered(shopId, good)) continue;
        if (intakesOf.has(shopId)) addPair(intakesOf.get(shopId)![0], shopId, good);
        else addPair(shopId, outletsOf.get(shopId)?.[0] ?? shopId, good);
    }

    const since = input.nowMs - DAY_MS;
    const moved = (shopId: string, good: GoodKey, side: "addedItems" | "removedItems") => {
        let total = 0;
        for (const event of input.events) {
            if (event.shopId !== shopId || event.timestampMs < since) continue;
            for (const stack of event[side]) if (stackKey(stack) === good) total += stack.quantity;
        }
        return total;
    };

    const lines: StockLine[] = [];
    for (const [key, {intake, outlet, good}] of pairs) {
        const linked = intake !== outlet;
        const buyOrders = buys.get(intake)?.get(good) ?? [];
        const sellOrders = sells.get(outlet)?.get(good) ?? [];
        const intakeOverride = config.overrides[overrideKey(intake, good)];
        const outletOverride = config.overrides[overrideKey(outlet, good)];
        const thresholds = resolveThresholds(config, intakeOverride, outletOverride);

        const intakeOnHand = counts.get(intake)?.get(good) ?? 0;
        const outletOnHand = linked ? counts.get(outlet)?.get(good) ?? 0 : intakeOnHand;
        const onHand = linked ? intakeOnHand + outletOnHand : intakeOnHand;
        const buyRemaining = buyOrders.some(order => order.remaining === null) ? null : buyOrders.reduce((sum, order) => sum + order.remaining!, 0);
        const sold24h = moved(outlet, good, "removedItems");
        const spread = buyOrders.length && sellOrders.length
            ? Math.min(...sellOrders.map(order => order.unitPrice)) - Math.max(...buyOrders.map(order => order.unitPrice))
            : null;

        const line: StockLine = {
            key,
            good,
            intakeShopId: intake,
            outletShopId: outlet,
            linked,
            buyOrders,
            sellOrders,
            buyRemaining,
            intakeOnHand,
            outletOnHand,
            onHand,
            bought24h: moved(intake, good, "addedItems"),
            sold24h,
            hoursToEmpty: sold24h > 0 ? outletOnHand / (sold24h / 24) : null,
            spread,
            thresholds,
            ignored: intakeOverride?.ignore === true || outletOverride?.ignore === true,
            issues: [],
        };
        line.issues = lineIssues(line, intakeOverride, outletOverride);
        lines.push(line);
    }
    return lines;
}

export interface LinkSuggestion {
    intakeShopId: string;
    outletShopId: string;
    /** Goods the intake buys that the outlet sells and the intake doesn't. */
    sharedGoods: number;
}

/** Stall pairs not yet linked where one buys goods the other sells, most shared goods first. */
export function suggestLinks(input: Pick<StockPlanInput, "shops" | "orders" | "config">): LinkSuggestion[] {
    const stalls = new Set(input.shops.map(shop => shop.id));
    const buys = new Map<string, Set<GoodKey>>();
    const sells = new Map<string, Set<GoodKey>>();
    for (const order of input.orders) {
        if (!order.active || !stalls.has(order.shopId)) continue;
        const kind = classifyOrder(order);
        if (kind.kind === "barter") continue;
        const side = kind.kind === "buy" ? buys : sells;
        let goods = side.get(order.shopId);
        if (!goods) side.set(order.shopId, goods = new Set());
        goods.add(kind.good);
    }
    const linked = new Set(input.config.links.map(link => `${link.intakeShopId}>${link.outletShopId}`));
    const suggestions: LinkSuggestion[] = [];
    for (const [intake, bought] of buys) {
        for (const [outlet, sold] of sells) {
            if (intake === outlet || linked.has(`${intake}>${outlet}`)) continue;
            const ownSales = sells.get(intake);
            let shared = 0;
            for (const good of bought) if (sold.has(good) && !ownSales?.has(good)) shared++;
            if (shared > 0) suggestions.push({intakeShopId: intake, outletShopId: outlet, sharedGoods: shared});
        }
    }
    return suggestions.sort((a, b) => b.sharedGoods - a.sharedGoods);
}

const BUY_FIELDS = ["batchSize", "reorderAt"] as const;
const SELL_FIELDS = ["outletLowAt", "outletTarget"] as const;

const ISSUE_ORDER: readonly StockIssue["kind"][] = ["missing-order", "move", "intake-full", "reset-buy", "sell-limit", "sold-out", "holding"];

/** Higher is more urgent; 0 for no issues. For sorting lines by their first issue. */
export function issueUrgency(issues: readonly StockIssue[]): number {
    return issues.length === 0 ? 0 : ISSUE_ORDER.length - ISSUE_ORDER.indexOf(issues[0].kind);
}

/** Most urgent first. */
export function lineIssues(line: StockLine, intakeOverride?: StockOverride, outletOverride?: StockOverride): StockIssue[] {
    const issues: StockIssue[] = [];
    const t = line.thresholds;
    const hasBuy = line.buyOrders.length > 0;
    const hasSell = line.sellOrders.length > 0;
    const buyOpen = hasBuy && line.buyRemaining !== 0;

    if (
        (!hasBuy && !hasSell)
        || (!hasBuy && BUY_FIELDS.some(field => intakeOverride?.[field] !== undefined))
        || (!hasSell && SELL_FIELDS.some(field => outletOverride?.[field] !== undefined))
    ) {
        issues.push({kind: "missing-order"});
    }
    if (line.linked && hasSell && line.intakeOnHand > 0 && line.outletOnHand <= t.outletLowAt) {
        const quantity = t.outletTarget === null ? line.intakeOnHand : Math.min(line.intakeOnHand, Math.max(t.outletTarget - line.outletOnHand, 0));
        if (quantity > 0) issues.push({kind: "move", quantity});
    }
    if (buyOpen && line.buyOrders.every(order => order.room === 0)) issues.push({kind: "intake-full"});
    if (hasBuy && line.buyRemaining === 0) {
        issues.push(line.onHand <= t.reorderAt ? {kind: "reset-buy", limit: t.batchSize} : {kind: "holding"});
    }
    if (line.sellOrders.some(order => order.remaining === 0)) issues.push({kind: "sell-limit"});
    const outOfGoods = (order: StockLineOrder) => order.capacity.trades === 0 && order.capacity.limitedBy === "inventory";
    if (hasSell && buyOpen && line.sellOrders.every(outOfGoods) && (!line.linked || line.intakeOnHand === 0)) {
        issues.push({kind: "sold-out"});
    }
    return issues.sort((a, b) => ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind));
}
