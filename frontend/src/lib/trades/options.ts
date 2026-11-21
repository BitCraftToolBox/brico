/**
 * options.ts — the trade finder's picker options, drawn from the live orders.
 */
import {parseGoodKey} from "@brico/trades/goods";
import type {FieldOption} from "~/components/crafts/FilterBuilder";
import type {TradeFilterField} from "~/components/trades/TradeQuickFilters";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {byLabel} from "~/lib/crafts/options";
import type {TradeEntry} from "~/lib/trades/entries";

/**
 * Options for every value on any order in `all`, with `active` set for values on some `listed`
 * order (the ones the finder can show).
 */
export function tradeFilterOptions(all: readonly TradeEntry[], listed: readonly TradeEntry[]): Record<TradeFilterField, FieldOption[]> {
    const items = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargo = BitCraftTables.CargoDesc.indexedBy("id")();
    const fields: Record<TradeFilterField, Map<string, FieldOption>> = {
        offered: new Map(), requested: new Map(), shops: new Map(), claims: new Map(), players: new Map(), shopTypes: new Map(),
    };
    const goodOption = (key: string): FieldOption | null => {
        const good = parseGoodKey(key);
        const desc = good && (good.kind === "Cargo" ? cargo.get(good.itemId) : items.get(good.itemId));
        return desc ? {value: key, label: desc.name, tier: desc.tier, rarity: desc.rarity} : null;
    };
    const add = (field: TradeFilterField, value: string | null, make: () => FieldOption | null) => {
        if (value === null || fields[field].has(value)) return;
        const option = make();
        if (option) fields[field].set(value, option);
    };
    for (const entry of all) {
        for (const key of entry.offerKeys) add("offered", key, () => goodOption(key));
        for (const key of entry.requestKeys) add("requested", key, () => goodOption(key));
        const shop = entry.shop;
        // Unnamed shops share their type name, so the claim or owner tells them apart.
        add("shops", shop.id, () => shop.name ? {value: shop.id, label: [shop.name, shop.claimName ?? shop.ownerName].filter(Boolean).join(" · ")} : null);
        add("claims", shop.claimId, () => ({value: shop.claimId!, label: shop.claimName ?? shop.claimId!}));
        add("players", shop.ownerId, () => shop.ownerName ? {value: shop.ownerId!, label: shop.ownerName} : null);
        add("shopTypes", shop.typeKey, () => shop.typeName ? {value: shop.typeKey!, label: shop.typeName} : null);
    }

    const active: Record<TradeFilterField, Set<string>> = {
        offered: new Set(), requested: new Set(), shops: new Set(), claims: new Set(), players: new Set(), shopTypes: new Set(),
    };
    for (const entry of listed) {
        for (const key of entry.offerKeys) active.offered.add(key);
        for (const key of entry.requestKeys) active.requested.add(key);
        active.shops.add(entry.shop.id);
        if (entry.shop.claimId) active.claims.add(entry.shop.claimId);
        if (entry.shop.ownerId) active.players.add(entry.shop.ownerId);
        if (entry.shop.typeKey) active.shopTypes.add(entry.shop.typeKey);
    }

    const result = {} as Record<TradeFilterField, FieldOption[]>;
    for (const field of Object.keys(fields) as TradeFilterField[]) {
        result[field] = [...fields[field].values()]
            .map(option => ({...option, active: active[field].has(option.value as string)}))
            .sort(byLabel);
    }
    return result;
}
