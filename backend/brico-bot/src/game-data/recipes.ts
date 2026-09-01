/**
 * recipes.ts — the static half of a craft's recipe, read from `CraftingRecipeDesc`.
 */
import {CargoDesc, CraftingRecipeDesc, ItemDesc, ItemType} from "@brico/bitcraft-bindings/types";
import type {CraftInputItem} from "@brico/crafts/filter";
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

export async function loadRecipeIndex(gameDataDir: string): Promise<RecipeIndex> {
    const [recipeRows, itemRows, cargoRows] = await Promise.all([
        loadGameDataTable<CraftingRecipeDesc>(gameDataDir, "crafting_recipe_desc", CraftingRecipeDesc.algebraicType),
        loadGameDataTable<ItemDesc>(gameDataDir, "item_desc", ItemDesc.algebraicType),
        loadGameDataTable<CargoDesc>(gameDataDir, "cargo_desc", CargoDesc.algebraicType),
    ]);
    const items = new Map(itemRows.map(item => [item.id, item]));
    const cargo = new Map(cargoRows.map(row => [row.id, row]));
    return new Map(recipeRows.map(recipe => [recipe.id, toStatic(recipe, items, cargo)]));
}
