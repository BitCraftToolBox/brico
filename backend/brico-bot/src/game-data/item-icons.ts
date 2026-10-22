/**
 * item-icons.ts — sprite, tier and rarity for every item/cargo (the whole catalog, not just recipe
 * outputs), read from offline `item_desc`/`cargo_desc` BSATN. Backs the `/icons/:shape/:id.webp` route.
 */
import {CargoDesc, ItemDesc} from "@brico/bitcraft-bindings/types";
import type {IconShape} from "@brico/crafts/icon-render";

import {loadGameDataTable} from "./load.ts";

export interface ItemIconFacts {
    iconAssetName: string;
    tier: number;
    /** `ItemDesc`/`CargoDesc.rarity.tag`. */
    rarityTag: string;
}

/** `"<shape>:<id>"` — item and cargo ids are separate id spaces and can collide, so the shape is part of the key. */
export function itemIconKey(shape: IconShape, id: number): string {
    return `${shape}:${id}`;
}

/** `itemIconKey(shape, id)` → icon facts. */
export type ItemIconIndex = ReadonlyMap<string, ItemIconFacts>;

export async function loadItemIconIndex(gameDataDir: string): Promise<ItemIconIndex> {
    const [itemRows, cargoRows] = await Promise.all([
        loadGameDataTable<ItemDesc>(gameDataDir, "item_desc", ItemDesc.algebraicType),
        loadGameDataTable<CargoDesc>(gameDataDir, "cargo_desc", CargoDesc.algebraicType),
    ]);

    const index = new Map<string, ItemIconFacts>();
    for (const item of itemRows) {
        index.set(itemIconKey("item", item.id), {iconAssetName: item.iconAssetName, tier: item.tier, rarityTag: item.rarity.tag});
    }
    for (const cargo of cargoRows) {
        index.set(itemIconKey("cargo", cargo.id), {iconAssetName: cargo.iconAssetName, tier: cargo.tier, rarityTag: cargo.rarity.tag});
    }
    return index;
}
