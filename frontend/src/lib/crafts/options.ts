/**
 * options.ts — the static (relay-independent) half of the craft filter builders' picker option
 * lists: every item, skill, tier, and building type a recipe could ever need, not just the ones a
 * currently open craft happens to have. Reused by the craft browser and the bounty rule builder,
 * both of which cross this with something live (open crafts, or nothing at all) to mark which
 * options are `active` — see `FieldOption.active`'s doc comment.
 */
import {ItemType} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {createMemo} from "solid-js";
import type {FieldOption} from "~/components/crafts/FilterBuilder";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {Tiers} from "~/lib/bitcraft-utils.ts";
import {gameText, useLabel} from "~/lib/labels.ts";

/** Alphabetical by label — the sort every option list here (and their callers') uses. */
export function byLabel(a: FieldOption, b: FieldOption): number {
    return a.label.localeCompare(b.label);
}

/**
 * Skill display order matching the in-game skill list, not alphabetical/id order — shared by the
 * bounty rule builder's skill/tier grid (`routes/account/bounties.tsx`) and the craft browser's
 * quick-filter skill grid, so both present skills in the same order.
 */
export const SKILL_ORDER: readonly number[] = [
    3, // Carpentry
    11, // Farming
    12, // Fishing
    14, // Foraging
    2, // Forestry
    9, // Hunting
    8, // Leatherworking
    4, // Masonry
    5, // Mining
    7, // Scholar
    6, // Smithing
    10, // Tailoring
    15, // Construction
    13, // Cooking
    19, // Merchanting
    21, // Sailing
    18, // Slayer
    17, // Taming
    // 22, Hexite Gathering - skip, not included
];

/** Every craft item/skill/tier/building-type a recipe in the game could produce or require. */
export interface CraftStaticOptions {
    item: FieldOption[];
    /** Every distinct item a recipe in the game could *consume* — a different universe from `item`
     * (raw materials that are never a crafted output, e.g. gathered logs, live here too). */
    inputItem: FieldOption[];
    /** Every distinct `ItemDesc`/`CargoDesc` category (`.tag`) that appears on some recipe's output
     * or input — shared between the `itemTag` and `inputItemTag` filter fields, which differ only in
     * which side of a recipe they test, not in which tags exist to test for. */
    itemTag: FieldOption[];
    skill: FieldOption[];
    tier: FieldOption[];
    buildingType: FieldOption[];
}

/**
 * Builds the static option universe off the currently loaded game data.
 */
export function craftStaticOptions(): CraftStaticOptions {
    const items = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargo = BitCraftTables.CargoDesc.indexedBy("id")();
    const recipes = BitCraftTables.CraftingRecipeDesc.get() ?? [];
    const skills = createMemo(() => {
        const skills = BitCraftTables.SkillDesc.get() ?? [];
        if (!skills.length) return [];
        const usedIds = new Set(recipes.map((recipe) => recipe.levelRequirements[0]?.skillId));
        return skills.filter(s => usedIds.has(s.id));
    });
    const buildingTypes = createMemo(() => {
        const buildings = BitCraftTables.BuildingTypeDesc.get() ?? [];
        if (!buildings.length) return [];
        const usedIds = new Set(recipes.map((recipe) => recipe.buildingRequirement?.buildingType));
        return buildings.filter(s => usedIds.has(s.id));
    });

    // Same `"item:<id>"`/`"cargo:<id>"` keying as `CraftSubject.item` — see `entries.ts`'s
    // `itemSubjectValue` doc comment for why the bare id alone isn't a stable key.
    const itemByKey = new Map<string, FieldOption>();
    const inputItemByKey = new Map<string, FieldOption>();
    const itemTags = new Set<string>();
    const descFor = (stack: {itemId: number; itemType: ItemType}) =>
        stack.itemType.tag === ItemType.Item.tag ? items.get(stack.itemId) : cargo.get(stack.itemId);
    for (const recipe of recipes) {
        const output = recipe.craftedItemStacks?.[0];
        if (output) {
            const desc = descFor(output);
            if (desc) {
                const key = `${output.itemType.tag === ItemType.Item.tag ? "item" : "cargo"}:${output.itemId}`;
                if (!itemByKey.has(key)) itemByKey.set(key, {value: key, label: desc.name, tier: desc.tier, rarity: desc.rarity});
                if (desc.tag) itemTags.add(desc.tag);
            }
        }
        for (const input of recipe.consumedItemStacks ?? []) {
            const desc = descFor(input);
            if (!desc) continue;
            const key = `${input.itemType.tag === ItemType.Item.tag ? "item" : "cargo"}:${input.itemId}`;
            if (!inputItemByKey.has(key)) inputItemByKey.set(key, {value: key, label: desc.name, tier: desc.tier, rarity: desc.rarity});
            if (desc.tag) itemTags.add(desc.tag);
        }
    }

    // item, skill, and building type come from BitCraft tables, so they are reactive on locale via the .get()/.indexedBy()
    // tier is truly static, so we need a separate reactive label resolver for it
    const label = useLabel();

    return {
        item: [...itemByKey.values()].sort(byLabel),
        inputItem: [...inputItemByKey.values()].sort(byLabel),
        itemTag: [...itemTags].sort().map(tag => ({value: tag, label: tag})),
        skill: skills().map(skill => ({value: skill.id, label: skill.name})).sort(byLabel),
        // required skill level, not output item tier, so only 1+
        tier: Tiers.tiers.filter(p => p.value > 0).map(p => ({
            value: p.value,
            label: label(gameText(msg`Tier ${p.value}`)),
            tier: p.value
        })),
        buildingType: buildingTypes().map(type => ({value: type.id, label: type.name})).sort(byLabel),
    };
}
