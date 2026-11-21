/**
 * stock-config.ts — a claim's stall stock settings: intake → outlet stall links, claim-wide
 * restock thresholds, and per (shop, good) overrides.
 *
 * Shops are referenced by entity id and goods by `GoodKey`, never by trade order id: editing an
 * order in game replaces it with a new id.
 */
import {type GoodKey, parseGoodKey} from "./goods.ts";

export const STOCK_CONFIG_KIND = "brico.trades.stock-config";
export const STOCK_CONFIG_VERSION = 1;

export interface StockThresholds {
    /** Buy side: the trade limit to give the buy order when raising it again (trades, as in game). */
    batchSize?: number;
    /** Buy side: raise the buy limit again once on-hand units (intake + outlet) are at or below this. */
    reorderAt?: number;
    /** Sell side: outlet on-hand units at or below this need restocking from intake. */
    outletLowAt?: number;
    /** Sell side: restock the outlet up to this many units; unset moves everything in intake. */
    outletTarget?: number;
}

export interface StockOverride extends StockThresholds {
    /** Leave this (shop, good) out of the "needs attention" list. */
    ignore?: boolean;
}

export interface StockLink {
    intakeShopId: string;
    outletShopId: string;
}

export interface StockConfig {
    version: typeof STOCK_CONFIG_VERSION;
    claimEntityId: string;
    links: StockLink[];
    defaults: StockThresholds;
    /** Keyed by `overrideKey(shopId, good)`. Buy-side fields are read from the intake shop's entry, sell-side from the outlet's. */
    overrides: Record<string, StockOverride>;
}

export function overrideKey(shopId: string, good: GoodKey): string {
    return `${shopId}|${good}`;
}

export function emptyStockConfig(claimEntityId: string): StockConfig {
    return {version: STOCK_CONFIG_VERSION, claimEntityId, links: [], defaults: {}, overrides: {}};
}

const MAX_LINKS = 500;
const MAX_OVERRIDES = 10_000;
const MAX_THRESHOLD = 2_147_483_646;
const THRESHOLD_FIELDS = ["batchSize", "reorderAt", "outletLowAt", "outletTarget"] as const;
const ENTITY_ID = /^\d{1,20}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseThresholds(raw: unknown): StockThresholds | null {
    if (!isRecord(raw)) return null;
    const thresholds: StockThresholds = {};
    for (const field of THRESHOLD_FIELDS) {
        const value = raw[field];
        if (value === undefined || value === null) continue;
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_THRESHOLD) return null;
        thresholds[field] = value;
    }
    return thresholds;
}

/**
 * A stock config from untrusted JSON (an import, localStorage), normalized; `null` if anything is
 * malformed. Unknown fields are dropped; an export's `kind` marker is accepted but not required.
 */
export function parseStockConfig(raw: unknown): StockConfig | null {
    if (!isRecord(raw)) return null;
    if (raw.kind !== undefined && raw.kind !== STOCK_CONFIG_KIND) return null;
    if (raw.version !== STOCK_CONFIG_VERSION) return null;
    if (typeof raw.claimEntityId !== "string" || !ENTITY_ID.test(raw.claimEntityId)) return null;

    const rawLinks = raw.links ?? [];
    if (!Array.isArray(rawLinks) || rawLinks.length > MAX_LINKS) return null;
    const links: StockLink[] = [];
    const seen = new Set<string>();
    for (const link of rawLinks) {
        if (!isRecord(link)) return null;
        const {intakeShopId, outletShopId} = link;
        if (typeof intakeShopId !== "string" || !ENTITY_ID.test(intakeShopId)) return null;
        if (typeof outletShopId !== "string" || !ENTITY_ID.test(outletShopId)) return null;
        const key = `${intakeShopId}>${outletShopId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({intakeShopId, outletShopId});
    }

    const defaults = parseThresholds(raw.defaults ?? {});
    if (!defaults) return null;

    const rawOverrides = raw.overrides ?? {};
    if (!isRecord(rawOverrides) || Object.keys(rawOverrides).length > MAX_OVERRIDES) return null;
    const overrides: Record<string, StockOverride> = {};
    for (const [key, value] of Object.entries(rawOverrides)) {
        const [shopId, good, extra] = key.split("|");
        if (extra !== undefined || !ENTITY_ID.test(shopId) || !good || !parseGoodKey(good)) return null;
        const thresholds = parseThresholds(value);
        if (!thresholds) return null;
        const ignore = (value as Record<string, unknown>).ignore;
        if (ignore !== undefined && typeof ignore !== "boolean") return null;
        const override: StockOverride = ignore ? {...thresholds, ignore} : thresholds;
        if (Object.keys(override).length > 0) overrides[key] = override;
    }

    return {version: STOCK_CONFIG_VERSION, claimEntityId: raw.claimEntityId, links, defaults, overrides};
}

/** The JSON a claim owner exports and shares. */
export function exportStockConfig(config: StockConfig): string {
    return JSON.stringify({kind: STOCK_CONFIG_KIND, ...config}, null, 2);
}
