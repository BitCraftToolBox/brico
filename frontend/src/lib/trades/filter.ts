/**
 * filter.ts — the trade finder's quick filter: multi-select per field, OR within a field, AND across.
 */
import type {TradeEntry} from "~/lib/trades/entries";

export interface TradeFilter {
    /** Good keys (`"item:<id>"`/`"cargo:<id>"`) the shop gives. */
    offered: string[];
    /** Good keys the shop asks for. */
    requested: string[];
    shops: string[];
    claims: string[];
    players: string[];
    /** `ShopEntry.typeKey` values. */
    shopTypes: string[];
    hideFull: boolean;
}

export const EMPTY_TRADE_FILTER: TradeFilter = {offered: [], requested: [], shops: [], claims: [], players: [], shopTypes: [], hideFull: false};

const LIST_FIELDS = ["offered", "requested", "shops", "claims", "players", "shopTypes"] as const;

/** A persisted/hand-edited value as a filter; anything malformed falls back to the empty value per field. */
export function parseTradeFilter(raw: unknown): TradeFilter {
    const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const filter: TradeFilter = {...EMPTY_TRADE_FILTER, hideFull: source.hideFull === true};
    for (const field of LIST_FIELDS) {
        const value = source[field];
        filter[field] = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    }
    return filter;
}

export function isEmptyTradeFilter(filter: TradeFilter): boolean {
    return !filter.hideFull && LIST_FIELDS.every(field => filter[field].length === 0);
}

export function tradeFilterTest(filter: TradeFilter): (entry: TradeEntry) => boolean {
    const sets = Object.fromEntries(LIST_FIELDS.map(field => [field, new Set(filter[field])])) as Record<(typeof LIST_FIELDS)[number], Set<string>>;
    const any = (set: Set<string>, values: readonly string[]) => set.size === 0 || values.some(value => set.has(value));
    const one = (set: Set<string>, value: string | null) => set.size === 0 || (value !== null && set.has(value));
    return entry =>
        !(filter.hideFull && entry.full)
        && any(sets.offered, entry.offerKeys)
        && any(sets.requested, entry.requestKeys)
        && one(sets.shops, entry.shop.id)
        && one(sets.claims, entry.shop.claimId)
        && one(sets.players, entry.shop.ownerId)
        && one(sets.shopTypes, entry.shop.typeKey);
}
