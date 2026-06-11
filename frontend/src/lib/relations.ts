/**
 * Relations — Data layer for finding relationships between game objects.
 *
 * Each function finds a specific one-directional relationship between objects.
 * Functions return raw SpacetimeDB types — display logic lives elsewhere.
 *
 * Stack matching helpers handle the various container types:
 *   ItemStack, InputItemStack, ProbabilisticItemStack, ItemListPossibility, cargo IDs
 */

import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {ContributionLootDesc} from "~/bindings/src/contribution_loot_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {InputItemStack} from "~/bindings/src/input_item_stack_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemListPossibility} from "~/bindings/src/item_list_possibility_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {ProbabilisticItemStack} from "~/bindings/src/probabilistic_item_stack_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {QuestDropDesc} from "~/bindings/src/quest_drop_desc_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {BitCraftTables} from "~/lib/spacetime";

const AOC_ID: number = 12345; // Art of Cheating knowledge ID

type stringFieldOf<T> = Extract<keyof T, string> & { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

function artOfCheatingThen<T extends { requiredKnowledges: number[] }>(field: stringFieldOf<T>) {
    return (a: T, b: T) => {
        const aoc_diff = a.requiredKnowledges.indexOf(AOC_ID) - b.requiredKnowledges.indexOf(AOC_ID);
        if (aoc_diff !== 0) return aoc_diff;
        return (a[field] as string).localeCompare(b[field] as string); // idk what's wrong here
    }
}

// ─── Stack Matchers ─────────────────────────────────────────────

function matchesStack(stack: ItemStack | InputItemStack, itemId: number, itemType: string): boolean {
    return stack.itemId === itemId && stack.itemType.tag === itemType;
}

function anyStackMatches(stacks: (ItemStack | InputItemStack)[], itemId: number, itemType: string): boolean {
    return stacks.some(s => matchesStack(s, itemId, itemType));
}

function anyProbStackMatches(stacks: ProbabilisticItemStack[], itemId: number, itemType: string): boolean {
    return stacks.some(s => {
        if (!s.itemStack) return false;
        if (matchesStack(s.itemStack, itemId, itemType)) return true;
        // Also check if the inner item resolves to an item list containing the target
        if (s.itemStack.itemType.tag === ItemType.Item.tag) {
            const item = BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(s.itemStack.itemId);
            if (item?.itemListId) {
                const list = BitCraftTables.ItemListDesc.indexedBy("id")?.()?.get(item.itemListId);
                if (list) return anyPossibilityMatches(list.possibilities, itemId, itemType);
            }
        }
        return false;
    });
}

function anyPossibilityMatches(possibilities: ItemListPossibility[], itemId: number, itemType: string): boolean {
    return possibilities.some(p => p.items.some(s => matchesStack(s, itemId, itemType)));
}


// ─── Crafting Recipes ───────────────────────────────────────────

/** Crafting recipes that produce this item/cargo as output */
export function craftingRecipesProducing(itemId: number, itemType: string): CraftingRecipeDesc[] {
    const all = BitCraftTables.CraftingRecipeDesc.get();
    if (!all) return [];
    const items = BitCraftTables.ItemDesc.indexedByMulti("itemListId")();
    const lists = itemListsContaining(itemId, itemType).flatMap(ild => items.get(ild.id)).filter((item): item is NonNullable<typeof item> => item !== undefined);
    return all.filter(r => {
        return anyStackMatches(r.craftedItemStacks, itemId, itemType)
            || lists?.some((listItem => anyStackMatches(r.craftedItemStacks, listItem.id, ItemType.Item.tag)));
    }).sort(artOfCheatingThen<CraftingRecipeDesc>("name"));
}

/** Crafting recipes that consume this item/cargo as input */
export function craftingRecipesConsuming(itemId: number, itemType: string): CraftingRecipeDesc[] {
    const all = BitCraftTables.CraftingRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => anyStackMatches(r.consumedItemStacks, itemId, itemType))
        .sort(artOfCheatingThen<CraftingRecipeDesc>("name"));
}

// ─── Extraction Recipes ─────────────────────────────────────────

/** The extraction recipe for a given resource */
export function extractionRecipeForResource(resourceId: number): ExtractionRecipeDesc | undefined {
    return BitCraftTables.ExtractionRecipeDesc.indexedBy("resourceId")()?.get(resourceId);
}

/** Extraction recipes that drop this item/cargo */
export function extractionRecipesDropping(itemId: number, itemType: string): ExtractionRecipeDesc[] {
    const all = BitCraftTables.ExtractionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => anyProbStackMatches(r.extractedItemStacks, itemId, itemType))
        .sort(artOfCheatingThen<ExtractionRecipeDesc>("verbPhrase"));
}

/** Extraction recipes that consume this item/cargo (bait, etc.) */
export function extractionRecipesConsuming(itemId: number, itemType: string): ExtractionRecipeDesc[] {
    const all = BitCraftTables.ExtractionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => {
        return anyStackMatches(r.consumedItemStacks, itemId, itemType);
    });
}

// ─── Construction Recipes ───────────────────────────────────────

/** The construction recipe for a given building */
export function constructionRecipeForBuilding(buildingId: number): ConstructionRecipeDesc | undefined {
    return BitCraftTables.ConstructionRecipeDesc.indexedBy("buildingDescriptionId")()?.get(buildingId);
}

/** Construction recipes that consume this item/cargo */
export function constructionRecipesConsuming(itemId: number, itemType: string): ConstructionRecipeDesc[] {
    const all = BitCraftTables.ConstructionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r =>
        anyStackMatches(r.consumedItemStacks, itemId, itemType) ||
        anyStackMatches(r.consumedCargoStacks, itemId, itemType)
    );
}

// ─── Deconstruction Recipes ─────────────────────────────────────

/** The deconstruction recipe for a given building */
export function deconstructionRecipeForBuilding(buildingId: number): DeconstructionRecipeDesc | undefined {
    return BitCraftTables.DeconstructionRecipeDesc.indexedBy("consumedBuilding")()?.get(buildingId);
}

/** Deconstruction recipes that produce this item/cargo as output */
export function deconstructionRecipesProducing(itemId: number, itemType: string): DeconstructionRecipeDesc[] {
    const all = BitCraftTables.DeconstructionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => anyStackMatches(r.outputItemStacks, itemId, itemType));
}

// ─── Conversion Recipes ─────────────────────────────────────────

/** Conversion recipes that consume this item/cargo */
export function conversionRecipesConsuming(itemId: number, itemType: string): ItemConversionRecipeDesc[] {
    const all = BitCraftTables.ItemConversionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => {
        return anyStackMatches(r.inputItems, itemId, itemType)
            && (!r.outputItem || !matchesStack(r.outputItem, itemId, itemType));
    });
}

/** Conversion recipes that produce this item/cargo */
export function conversionRecipesProducing(itemId: number, itemType: string): ItemConversionRecipeDesc[] {
    const all = BitCraftTables.ItemConversionRecipeDesc.get();
    if (!all) return [];
    return all.filter(r => {
        return r.outputItem && matchesStack(r.outputItem, itemId, itemType)
            && !anyStackMatches(r.inputItems, itemId, itemType);
    });
}

// ─── Traveler Tasks ─────────────────────────────────────────────

function compareTasks(a: TravelerTaskDesc, b: TravelerTaskDesc) {
    const s = a.levelRequirement.skillId - b.levelRequirement.skillId;
    if (s !== 0) return s;
    const m = a.levelRequirement.minLevel - b.levelRequirement.minLevel;
    if (m !== 0) return m;
    return a.requiredItems[0].itemId - b.requiredItems[0].itemId;
}

/** Traveler tasks that require this item/cargo */
export function travelerTasksRequiring(itemId: number, itemType: string): TravelerTaskDesc[] {
    const all = BitCraftTables.TravelerTaskDesc.get();
    if (!all) return [];
    return all.filter(t => anyStackMatches(t.requiredItems, itemId, itemType)).sort(compareTasks);
}

/** Traveler tasks that reward this item/cargo */
export function travelerTasksRewarding(itemId: number, itemType: string): TravelerTaskDesc[] {
    const all = BitCraftTables.TravelerTaskDesc.get();
    if (!all) return [];
    return all.filter(t => anyStackMatches(t.rewardedItems, itemId, itemType)).sort(compareTasks);
}

// ─── Traveler Trades ────────────────────────────────────────────

/** Traveler trades that require this item/cargo */
export function travelerTradesRequiring(itemId: number, itemType: string): TravelerTradeOrderDesc[] {
    const all = BitCraftTables.TravelerTradeOrderDesc.get();
    if (!all) return [];
    return all.filter(t => {
        return anyStackMatches(t.requiredItems, itemId, itemType);
        // BitCraft doesn't actually use requiredCargoId at the moment
        // return itemType === ItemType.Cargo.tag && anyCargoIdMatches(t.requiredCargoId, itemId);
    }).sort((a, b) => a.traveler.tag.localeCompare(b.traveler.tag));
}

/** Traveler trades that offer this item/cargo */
export function travelerTradesOffering(itemId: number, itemType: string): TravelerTradeOrderDesc[] {
    const all = BitCraftTables.TravelerTradeOrderDesc.get();
    if (!all) return [];
    return all.filter(t => {
        return anyStackMatches(t.offerItems, itemId, itemType);
        // as above
        // return itemType === ItemType.Cargo.tag && anyCargoIdMatches(t.offerCargoId, itemId);
    }).sort((a, b) => a.traveler.tag.localeCompare(b.traveler.tag));
}

// ─── Item Lists ─────────────────────────────────────────────────

/** Item lists that contain this item/cargo as a possibility */
export function itemListsContaining(itemId: number, itemType: string): ItemListDesc[] {
    const all = BitCraftTables.ItemListDesc.get();
    if (!all) return [];
    return all.filter(l => anyPossibilityMatches(l.possibilities, itemId, itemType));
}

export type ItemListSource =
    | { type: "Item"; item: ItemDesc }
    | { type: "Enemy"; loot: ContributionLootDesc; enemy?: EnemyDesc }
    | { type: "Unknown" };

export function getItemListSource(il: ItemListDesc | undefined): ItemListSource {
    if (!il) return {type: "Unknown"};

    // Check if any item references this list (ItemDesc.itemListId)
    const items = BitCraftTables.ItemDesc.indexedByMulti("itemListId")().get(il.id);
    let matchedItem = items?.length ? items[0] : null;
    // TODO see item-list-table
    if (items?.length && il.id === 1096831250) matchedItem = items.find(i => i.id === 1753489769) ?? matchedItem;
    if (matchedItem) return {type: "Item", item: matchedItem};

    // Check ContributionLootDesc -> enemyTypeId -> EnemyDesc
    const enemyIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType");
    // NB should also be multi but doesn't happen in practice
    const lootDescs = BitCraftTables.ContributionLootDesc.indexedBy("itemListId");
    const matchedLoot = lootDescs().get(il.id);
    if (matchedLoot) return {type: "Enemy", loot: matchedLoot, enemy: enemyIndex()?.get(matchedLoot.enemyTypeId)};

    return {type: "Unknown"};
}

export function contributionLootFromEnemy(enemy: EnemyDesc | undefined): [ContributionLootDesc, ItemListDesc][] {
    if (!enemy) return [];
    const lootDescs = BitCraftTables.ContributionLootDesc.get();
    if (!lootDescs) return [];
    const matchedLoot = lootDescs.filter(cl => cl.enemyTypeId === enemy.enemyType);
    if (!matchedLoot) return [];
    const itemListIndex = BitCraftTables.ItemListDesc.indexedBy("id")();
    return matchedLoot.map(cl => [cl, itemListIndex.get(cl.itemListId)])
        .filter((p): p is [ContributionLootDesc, ItemListDesc] => !!p[1])
        .sort((a, b) => b[0].minimumContribution - a[0].minimumContribution);
}

// ─── Resource Depletion ─────────────────────────────────────────

/** Resources whose onDestroyYield contains this item/cargo */
export function resourcesYielding(itemId: number, itemType: string): ResourceDesc[] {
    const all = BitCraftTables.ResourceDesc.get();
    if (!all) return [];
    return all.filter(r => r.onDestroyYield.length > 0 && anyStackMatches(r.onDestroyYield, itemId, itemType));
}

export function resourcesYieldingResource(res: number): ResourceDesc[] {
    const all = BitCraftTables.ResourceDesc.get();
    if (!all) return [];
    return all.filter(r => r.onDestroyYieldResourceId === res);
}

// ─── Cross-Table Relationships ──────────────────────────────────

/** Enemies associated with a resource (via enemyParamsId -> EnemyAiParamsDesc -> EnemyDesc) */
export function enemiesForResource(resource: ResourceDesc): EnemyDesc[] {
    if (!resource.enemyParamsId?.length) return [];
    const paramIdx = BitCraftTables.EnemyAiParamsDesc.indexedBy("id")();
    const enemyIdx = BitCraftTables.EnemyDesc.indexedBy("enemyType")();
    if (!paramIdx || !enemyIdx) return [];
    return resource.enemyParamsId
        .map(id => {
            const p = paramIdx.get(id);
            return p ? enemyIdx.get(p.enemyType as any) : undefined;
        })
        .filter((e): e is EnemyDesc => !!e);
}

/** Prospecting entries for a given biome */
export function prospectingForBiome(biomeType: number): ProspectingDesc[] {
    const all = BitCraftTables.ProspectingDesc.get();
    if (!all) return [];
    return all.filter(p => p.biomeRequirements?.includes(biomeType));
}

/** Resolve prerequisite achievements by their IDs */
export function achievementPrereqs(requisites: number[]): AchievementDesc[] {
    if (!requisites?.length) return [];
    const idx = BitCraftTables.AchievementDesc.indexedBy("id")();
    if (!idx) return [];
    return requisites.map(id => idx.get(id)).filter((v): v is AchievementDesc => !!v);
}

/** Resolve collectible rewards by their IDs */
export function collectibleRewards(collectibleIds: number[]): CollectibleDesc[] {
    if (!collectibleIds?.length) return [];
    const idx = BitCraftTables.CollectibleDesc.indexedBy("id")();
    if (!idx) return [];
    return collectibleIds.map(id => idx.get(id)).filter((v): v is CollectibleDesc => !!v);
}

// ─── Display Name Helpers ───────────────────────────────────────

/** Resolve a crafting recipe's display name, substituting item names into the template */
export function getCraftingRecipeName(recipe: CraftingRecipeDesc): string {
    const itemData = BitCraftTables.ItemDesc.indexedBy("id")()!;
    const cargoData = BitCraftTables.CargoDesc.indexedBy("id")()!;
    const mainOutput = recipe.craftedItemStacks.at(0);
    const mainInput = recipe.consumedItemStacks.at(0);
    if (!mainOutput) return recipe.name;
    const outputItem = mainOutput.itemType.tag === ItemType.Item.tag
        ? itemData.get(mainOutput.itemId) : cargoData.get(mainOutput.itemId);
    const inputItem = mainInput
        ? (mainInput.itemType.tag === ItemType.Item.tag
            ? itemData.get(mainInput.itemId) : cargoData.get(mainInput.itemId))
        : undefined;
    const building = recipe.buildingRequirement?.buildingType;
    if (building && [104950060, 1837107818].includes(building)) {
        // Taming Workstation, Sailing Workstation. Blame CWL. Something is hardcoded into the client and I assume it's this.
        return outputItem?.name ?? recipe.name;
    }
    return recipe.name
        .replace("{1}", inputItem?.name || "{1}")
        .replace("{0}", outputItem?.name || "{0}");
}

/** Display name for an extraction recipe */
export function getExtractionRecipeName(recipe: ExtractionRecipeDesc): string {
    const resource = recipe.resourceId
        ? BitCraftTables.ResourceDesc.indexedBy("id")()?.get(recipe.resourceId)
        : undefined;
    const cargo = recipe.cargoId
        ? BitCraftTables.CargoDesc.indexedBy("id")()?.get(recipe.cargoId)
        : undefined;
    return recipe.verbPhrase + " " + (resource?.name ?? cargo?.name ?? "Unknown");
}

/** Display name for a construction recipe */
export function getConstructionRecipeName(recipe: ConstructionRecipeDesc): string {
    // wild RHS but it doesn't ever occur
    return recipe.name || ("Construct " + (BitCraftTables.BuildingDesc.indexedBy("id")()?.get(recipe.buildingDescriptionId)?.name ?? ("Building #" + recipe.buildingDescriptionId)));
}

/** Display name for a deconstruction recipe */
export function getDeconstructionRecipeName(recipe: DeconstructionRecipeDesc): string {
    const building = BitCraftTables.BuildingDesc.indexedBy("id")()?.get(recipe.consumedBuilding);
    return "Deconstruct " + (building?.name ?? "Unknown");
}

/** Display name for a conversion recipe */
export function getConversionRecipeName(recipe: ItemConversionRecipeDesc): string {
    return recipe.name;
}

/** Display name for a traveler task */
export function getTravelerTaskName(task: TravelerTaskDesc): string {
    const skill = BitCraftTables.SkillDesc.indexedBy("id")()?.get(task.levelRequirement.skillId);
    const firstItem = task.requiredItems.find(s => !isHexCoin(s)) ?? task.rewardedItems.find(s => !isHexCoin(s));
    const pfx = (skill?.name ? skill.name + " " : "") + " Task: ";
    return pfx + getItemStackName(firstItem);
}

/** Resolve the NPC name for a traveler tag string */
export function getTravelerNpcName(travelerTag: string): string {
    const tagOrdinal = BitCraftTables.TravelerTradeOrderDesc.tagToOrdinal("traveler");
    const npcOrdinal = tagOrdinal.get(travelerTag);
    if (npcOrdinal !== undefined) {
        return BitCraftTables.NpcDesc.indexedBy("npcType")()?.get(npcOrdinal)?.name ?? travelerTag;
    }
    return travelerTag;
}

const HEX_COIN_ID = 1;
const isHexCoin = (s: ItemStack) => s.itemType.tag === ItemType.Item.tag && s.itemId === HEX_COIN_ID;

/** Display name for a traveler trade */
export function getTravelerTradeName(trade: TravelerTradeOrderDesc): string {
    const npcName = getTravelerNpcName(trade.traveler.tag);

    const hasHexInRequired = trade.requiredItems.some(isHexCoin);
    const hasHexInOffer = trade.offerItems.some(isHexCoin);

    if (hasHexInRequired) {
        // Paying with hex coins → buying something
        const itemName = getItemStackName(trade.offerItems[0]);
        return `Buy ${itemName} from ${npcName}`;
    }
    if (hasHexInOffer) {
        // Receiving hex coins → selling something
        const itemName = getItemStackName(trade.requiredItems[0]);
        return `Sell ${itemName} to ${npcName}`;
    }
    // Generic item-for-item trade
    const reqName = getItemStackName(trade.requiredItems[0]);
    const offerName = getItemStackName(trade.offerItems[0]);
    return `Trade ${reqName} for ${offerName} to ${npcName}`;
}

/** Display name for an item list */
export function getItemListName(list: ItemListDesc): string {
    return list.name;
}

export function getItemStackName(stack: ItemStack | undefined): string {
    if (!stack) return "Unknown";
    if (stack.itemType.tag === ItemType.Item.tag) {
        const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")();
        return itemIndex.get(stack.itemId)?.name ?? "Item #" + stack.itemId;
    }
    if (stack.itemType.tag === ItemType.Cargo.tag) {
        const cargoIndex = BitCraftTables.CargoDesc.indexedBy("id")();
        return cargoIndex.get(stack.itemId)?.name ?? "Cargo #" + stack.itemId;
    }
    return "Unknown";
}

/** Display name for a resource depletion relationship */
export function getResourceDepletionName(resource: ResourceDesc): string {
    return "Deplete " + resource.name;
}

/** Get the resource associated with an extraction recipe (if any) */
export function resourceForExtraction(recipe: ExtractionRecipeDesc): ResourceDesc | undefined {
    if (!recipe.resourceId) return undefined;
    return BitCraftTables.ResourceDesc.indexedBy("id")()?.get(recipe.resourceId);
}

/** Get the building associated with a deconstruction recipe */
export function buildingForDeconstruction(recipe: DeconstructionRecipeDesc): BuildingDesc | undefined {
    return BitCraftTables.BuildingDesc.indexedBy("id")()?.get(recipe.consumedBuilding);
}

/** Get the building associated with a construction recipe */
export function buildingForConstruction(recipe: ConstructionRecipeDesc): BuildingDesc | undefined {
    return BitCraftTables.BuildingDesc.indexedBy("id")()?.get(recipe.buildingDescriptionId);
}

// ─── Enemy Drops ─────────────────────────────────────────────────

/** Enemies that drop this item/cargo in their extractedItemStacks */
export function enemiesDropping(itemId: number, itemType: string): EnemyDesc[] {
    const all = BitCraftTables.EnemyDesc.get();
    if (!all) return [];
    return all.filter(e => anyProbStackMatches(e.extractedItemStacks, itemId, itemType));
}

// ─── Quest Drops ─────────────────────────────────────────────────

/** Quest drops that conditionally drop this item/cargo */
export function questDropsContaining(itemId: number, itemType: string): QuestDropDesc[] {
    const all = BitCraftTables.QuestDropDesc.get();
    if (!all) return [];
    return all.filter(q => q.itemDrop && anyProbStackMatches([q.itemDrop], itemId, itemType));
}

/** Quest drops linked to an extraction recipe (by ExtractionRecipeDesc.id) */
export function questDropsForExtraction(extractionId: number): QuestDropDesc[] {
    if (!extractionId) return [];
    return BitCraftTables.QuestDropDesc.get()?.filter(q => q.extractionId === extractionId) ?? [];
}

/** Quest drops linked to an enemy (by EnemyDesc.enemyType) */
export function questDropsForEnemy(enemyType: number): QuestDropDesc[] {
    if (!enemyType) return [];
    return BitCraftTables.QuestDropDesc.get()?.filter(q => q.enemyId === enemyType) ?? [];
}

/** Quest drops linked to an item list */
export function questDropsForItemList(itemListId: number): QuestDropDesc[] {
    if (!itemListId) return [];
    return BitCraftTables.QuestDropDesc.get()?.filter(q => q.itemListId === itemListId) ?? [];
}

// ─── Quest Chain Relations ───────────────────────────────────────

/** Quest chains that require this entity (by tag + value) in their requirements array */
export function questsRequiring(tag: string, id: number): QuestChainDesc[] {
    const all = BitCraftTables.QuestChainDesc.get();
    if (!all) return [];
    return all.filter(q =>
        q.requirements?.some(r => r.tag === tag && r.value === id)
    );
}

/** Quest chains that reward this entity (by tag + value) in their rewards or implicitRewards arrays */
export function questsRewarding(tag: string, id: number): QuestChainDesc[] {
    const all = BitCraftTables.QuestChainDesc.get();
    if (!all) return [];
    return all.filter(q =>
        [...(q.rewards ?? []), ...(q.implicitRewards ?? [])].some(r => r.tag === tag && r.value === id)
    );
}

/** Quest chains that require this item/cargo in any requirement ItemStack */
export function questsRequiringItem(itemId: number, itemType: string): QuestChainDesc[] {
    const all = BitCraftTables.QuestChainDesc.get();
    if (!all) return [];
    return all.filter(q =>
        q.requirements?.some(r => {
            if (r.tag !== "ItemStack") return false;
            const s = r.value as ItemStack;
            return s.itemId === itemId && s.itemType.tag === itemType;
        })
    );
}

/** Quest chains that reward this item/cargo in any reward/implicit reward ItemStack */
export function questsRewardingItem(itemId: number, itemType: string): QuestChainDesc[] {
    const all = BitCraftTables.QuestChainDesc.get();
    if (!all) return [];
    return all.filter(q =>
        [...(q.rewards ?? []), ...(q.implicitRewards ?? [])].some(r => {
            if (r.tag !== "ItemStack") return false;
            const s = r.value as ItemStack;
            return s.itemId === itemId && s.itemType.tag === itemType;
        })
    );
}

/** Quest chains whose stages have a CompletionCondition matching the given tag + value */
export function questsWithStageCondition(tag: string, id: number): QuestChainDesc[] {
    const stages = BitCraftTables.QuestStageDesc.get();
    if (!stages) return [];
    const chainIds = new Set<number>();
    for (const s of stages) {
        if (s.completionConditions?.some(c => c.tag === tag && c.value === id)) {
            chainIds.add(s.chainDescId);
        }
    }
    if (!chainIds.size) return [];
    const chainIndex = BitCraftTables.QuestChainDesc.indexedBy("id")();
    return Array.from(chainIds).map(id => chainIndex?.get(id)).filter((q): q is QuestChainDesc => !!q);
}

/** Quest chains whose stages require this item/cargo via ItemStack or EquippedItem conditions */
export function questsWithStageConditionItem(itemId: number, itemType: string): QuestChainDesc[] {
    const stages = BitCraftTables.QuestStageDesc.get();
    if (!stages) return [];
    const chainIds = new Set<number>();
    for (const s of stages) {
        if (s.completionConditions?.some(c => {
            if (c.tag === "EquippedItem" && itemType === ItemType.Item.tag) return c.value === itemId;
            if (c.tag !== "ItemStack") return false;
            const isc = c.value as { itemStack: ItemStack };
            return isc.itemStack.itemId === itemId && isc.itemStack.itemType.tag === itemType;
        })) {
            chainIds.add(s.chainDescId);
        }
    }
    if (!chainIds.size) return [];
    const chainIndex = BitCraftTables.QuestChainDesc.indexedBy("id")();
    return Array.from(chainIds).map(id => chainIndex?.get(id)).filter((q): q is QuestChainDesc => !!q);
}

/**
 * Returns the unique set of extraction recipes, enemies, and item lists
 * that conditionally drop this item via quest drops.
 * Use this to augment the normal drop source lists on item/cargo pages.
 */
export function questDropSourcesFor(itemId: number, itemType: string): {
    extractionRecipes: ExtractionRecipeDesc[];
    enemies: EnemyDesc[];
    itemLists: ItemListDesc[];
} {
    const drops = questDropsContaining(itemId, itemType);
    const extractionRecipes: ExtractionRecipeDesc[] = [];
    const enemies: EnemyDesc[] = [];
    const itemLists: ItemListDesc[] = [];
    const exIds = new Set<number>();
    const enIds = new Set<number>();
    const ilIds = new Set<number>();

    const exIndex = BitCraftTables.ExtractionRecipeDesc.indexedBy("id")();
    const enIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType")();
    const ilIndex = BitCraftTables.ItemListDesc.indexedBy("id")();

    for (const qd of drops) {
        if (qd.extractionId > 0 && !exIds.has(qd.extractionId)) {
            exIds.add(qd.extractionId);
            const r = exIndex?.get(qd.extractionId);
            if (r) extractionRecipes.push(r);
        }
        if (qd.enemyId > 0 && !enIds.has(qd.enemyId)) {
            enIds.add(qd.enemyId);
            const e = enIndex?.get(qd.enemyId);
            if (e) enemies.push(e);
        }
        if (qd.itemListId > 0 && !ilIds.has(qd.itemListId)) {
            ilIds.add(qd.itemListId);
            const l = ilIndex?.get(qd.itemListId);
            if (l) itemLists.push(l);
        }
    }

    return { extractionRecipes, enemies, itemLists };
}
