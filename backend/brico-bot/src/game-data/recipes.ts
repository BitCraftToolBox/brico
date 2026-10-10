/**
 * recipes.ts — the static half of a craft's recipe, read from `CraftingRecipeDesc`.
 */
import {CargoDesc, CraftingRecipeDesc, ItemDesc, ItemType} from "@brico/bitcraft-bindings/types";
import type {CraftInputItem} from "@brico/crafts/filter";
import type {IconShape} from "@brico/crafts/icon-render";
import {craftingRecipeDisplayName} from "@brico/crafts/names";
import type {RecipeStatic} from "@brico/crafts/subject";

import {loadGameDataTable} from "./load.ts";

export type {RecipeStatic};

/** `"item:<id>"` or `"cargo:<id>"` for one recipe stack */
function keyFor(stack: {itemId: number; itemType: ItemType}): string {
    return `${stack.itemType.tag === ItemType.Item.tag ? "item" : "cargo"}:${stack.itemId}`;
}

/** A stack's item category, or `null` when its `ItemDesc`/`CargoDesc` row hasn't resolved. */
function tagFor(
    stack: {itemId: number; itemType: ItemType} | undefined,
    items: ReadonlyMap<number, ItemDesc>,
    cargo: ReadonlyMap<number, CargoDesc>,
): string | null {
    if (!stack) return null;
    const desc = stack.itemType.tag === ItemType.Item.tag ? items.get(stack.itemId) : cargo.get(stack.itemId);
    return desc?.tag ?? null;
}

function itemNameFor(
    stack: {itemId: number; itemType: ItemType} | undefined,
    items: ReadonlyMap<number, ItemDesc>,
    cargo: ReadonlyMap<number, CargoDesc>,
): string | undefined {
    if (!stack) return undefined;
    const desc = stack.itemType.tag === ItemType.Item.tag ? items.get(stack.itemId) : cargo.get(stack.itemId);
    return desc?.name;
}

/** Key into `ItemIconIndex` (`item-icons.ts`) for a recipe's output icon. */
export interface RecipeIconRef {
    shape: IconShape;
    id: number;
}

function iconRefFor(stack: {itemId: number; itemType: ItemType} | undefined): RecipeIconRef | null {
    if (!stack) return null;
    return {shape: stack.itemType.tag === ItemType.Item.tag ? "item" : "cargo", id: stack.itemId};
}

function toStatic(
    recipe: CraftingRecipeDesc,
    items: ReadonlyMap<number, ItemDesc>,
    cargo: ReadonlyMap<number, CargoDesc>,
): RecipeStatic {
    const requirement = recipe.levelRequirements[0];
    const stack = recipe.craftedItemStacks[0];
    const inputItems: CraftInputItem[] = recipe.consumedItemStacks.map(input => ({
        key: keyFor(input),
        tag: tagFor(input, items, cargo),
    }));
    return {
        effortRequired: recipe.actionsRequired,
        skillId: requirement?.skillId ?? null,
        buildingType: recipe.buildingRequirement?.buildingType ?? null,
        levelRequired: requirement?.level ?? 0,
        itemKey: stack ? keyFor(stack) : null,
        itemTag: tagFor(stack, items, cargo),
        inputItems,
    };
}

/** `craft_meta.recipeId` → the static facts about that recipe. Loaded once; never changes at runtime. */
export type RecipeIndex = ReadonlyMap<number, RecipeStatic>;

export interface RecipeDisplayInfo {
    /** See `@brico/crafts/names`'s `craftingRecipeDisplayName`. */
    name: string;
    /** `null` when the recipe crafts nothing (some recipe rows have an empty `craftedItemStacks`). */
    icon: RecipeIconRef | null;
}

/** `craft_meta.recipeId` → display info (name + icon). */
export type RecipeDisplayIndex = ReadonlyMap<number, RecipeDisplayInfo>;

async function loadGameData(gameDataDir: string) {
    const [recipeRows, itemRows, cargoRows] = await Promise.all([
        loadGameDataTable<CraftingRecipeDesc>(gameDataDir, "crafting_recipe_desc", CraftingRecipeDesc.algebraicType),
        loadGameDataTable<ItemDesc>(gameDataDir, "item_desc", ItemDesc.algebraicType),
        loadGameDataTable<CargoDesc>(gameDataDir, "cargo_desc", CargoDesc.algebraicType),
    ]);
    const items = new Map(itemRows.map(item => [item.id, item]));
    const cargo = new Map(cargoRows.map(row => [row.id, row]));
    return {recipeRows, items, cargo};
}

export async function loadRecipeIndex(gameDataDir: string): Promise<RecipeIndex> {
    const {recipeRows, items, cargo} = await loadGameData(gameDataDir);
    return new Map(recipeRows.map(recipe => [recipe.id, toStatic(recipe, items, cargo)]));
}

/** Presentation-only recipe names/icons, kept out of `RecipeStatic`/`CraftSubject` since filters never use them. */
export async function loadRecipeDisplayIndex(gameDataDir: string): Promise<RecipeDisplayIndex> {
    const {recipeRows, items, cargo} = await loadGameData(gameDataDir);
    return new Map(recipeRows.map(recipe => {
        const output = recipe.craftedItemStacks[0];
        return [
            recipe.id,
            {
                name: craftingRecipeDisplayName(
                    recipe.name,
                    itemNameFor(output, items, cargo),
                    itemNameFor(recipe.consumedItemStacks[0], items, cargo),
                    recipe.buildingRequirement?.buildingType ?? null,
                ),
                icon: iconRefFor(output),
            },
        ];
    }));
}
