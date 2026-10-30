import type {CollectibleType, PremiumItemDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {sourceRow} from "~/lib/data-translation";
import {trackUILocale} from "~/lib/i18n";
import {gameText, labelText} from "~/lib/labels";

/** Keys are the canonical English type names, which filter state and shared URLs carry. */
export const PREMIUM_ITEM_TYPE_LABELS = {
    Clothing: gameText(msg`Clothing`),
    Pets: gameText(msg`Pets`),
    Decor: gameText(msg`Decor`),
    Emotes: gameText(msg`Emotes`),
    Bundles: gameText(msg`Bundles`),
    Other: gameText(msg`Other`),
};

export type PremiumItemType = keyof typeof PREMIUM_ITEM_TYPE_LABELS;

function collectibleGroup(tag: CollectibleType["tag"]): PremiumItemType {
    if (tag.startsWith("Clothes") || tag === "FaceAccessory" || tag === "FacialHair") return "Clothing";
    switch (tag) {
        case "Pet":
            return "Pets";
        case "PremiumItem":
            return "Decor";
        case "Emote":
            return "Emotes";
        default:
            return "Other";
    }
}

/**
 * Canonical English types of a premium item: the one group its collectibles share ("Other" when
 * they span several), plus "Bundles" when the English name says so. A bundle with no single group
 * is only "Bundles". Reactive on the collectible table.
 */
export function premiumItemTypes(item: PremiumItemDesc): PremiumItemType[] {
    const collectibles = BitCraftTables.CollectibleDesc.indexedBy("id")();
    const groups = new Set<PremiumItemType>();
    for (const id of item.collectibleIds) {
        const collectible = collectibles.get(id);
        if (collectible) groups.add(collectibleGroup(collectible.collectibleType.tag));
    }
    const group: PremiumItemType = groups.size === 1 ? [...groups][0] : "Other";
    if (!sourceRow(item).name.includes("Bundle")) return [group];
    return group === "Other" ? ["Bundles"] : [group, "Bundles"];
}

/** Display text for a canonical type name, translated into the active locales. Reactive. */
export function premiumItemTypeLabel(type: string): string {
    trackUILocale();
    const label = PREMIUM_ITEM_TYPE_LABELS[type as PremiumItemType];
    return label ? labelText(label) : type;
}
