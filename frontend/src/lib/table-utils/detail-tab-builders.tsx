/**
 * Reusable Detail Tab Builders
 *
 * Provides factory functions for common recipe/relationship tabs
 * shared across multiple detail pages.
 */

import {createSignal, Show} from "solid-js";
import {ConstructionRecipeDescV2} from "~/bindings/src/construction_recipe_desc_v_2_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
//import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
//import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {RelationshipTab, RelTable} from "~/components/shared/DetailPageLayout";
import {
    ConstructionRecipePanel,
    ConversionRecipePanel,
    CraftingRecipePanel,
    DeconstructionRecipePanel,
    EnemyDropPanel,
    ExtractionRecipePanel,
    ItemListPanel,
    RecipeSelect,
    renderKnowledgeLockedItem,
    ResourceDepletionPanel,
    TravelerTaskPanel,
    TravelerTradePanel,
} from "~/components/shared/RecipeDisplay";
import {QuestChainLink} from "~/lib/game-links";
import {
    getConstructionRecipeName,
    getConversionRecipeName,
    getCraftingRecipeName,
    getDeconstructionRecipeName,
    getExtractionRecipeName,
    getItemListName,
    getResourceDepletionName,
    getTravelerTaskName,
    getTravelerTradeName,
} from "~/lib/relations";

// ─── Individual Recipe Tab Builders ─────────────────────────────────

export function craftedFromTab(
    recipes: CraftingRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "crafted-from",
        label: "Crafted From",
        count: recipes.length,
        showWhenEmpty,
        content: () => (
            <RecipeSelect
                recipes={recipes}
                nameFor={getCraftingRecipeName}
                render={r => <CraftingRecipePanel recipe={r}/>}
                renderSelectItem={renderKnowledgeLockedItem}
            />
        ),
    };
}

export function craftsIntoTab(
    recipes: CraftingRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "crafts-into",
        label: "Crafts Into",
        count: recipes.length,
        showWhenEmpty,
        content: () => (
            <RecipeSelect
                recipes={recipes}
                nameFor={getCraftingRecipeName}
                render={r => <CraftingRecipePanel recipe={r}/>}
                renderSelectItem={renderKnowledgeLockedItem}
            />
        ),
    };
}

export function extractionTab(
    drops: ExtractionRecipeDesc[],
    uses: ExtractionRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "extraction",
        label: "Extraction",
        count: drops.length + uses.length,
        showWhenEmpty,
        content: () => (
            <div class="space-y-4">
                <Show when={drops.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Dropped from</h4>
                        <RecipeSelect
                            recipes={drops}
                            nameFor={getExtractionRecipeName}
                            render={r => <ExtractionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
                <Show when={uses.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Used in</h4>
                        <RecipeSelect
                            recipes={uses}
                            nameFor={getExtractionRecipeName}
                            render={r => <ExtractionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
            </div>
        ),
    };
}

export function depletionTab(
    extractionDrops: ExtractionRecipeDesc[],
    extractionUses: ExtractionRecipeDesc[],
    depletionSources: ResourceDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "depletion",
        label: "Resource Depletion",
        showWhenEmpty,
        count: (extractionDrops.length + extractionUses.length) ? 0 : depletionSources.length,
        content: () => (
            <RecipeSelect
                recipes={depletionSources}
                nameFor={getResourceDepletionName}
                render={r => <ResourceDepletionPanel resource={r}/>}
            />
        ),
    };
}

/**
 * Combined construction tab - groups construction and deconstruction together
 * with synchronized selection (selecting one auto-selects the matching deconstruction)
 */
export function constructionCombinedTab(
    constructsInto: ConstructionRecipeDescV2[],
    deconstructedFrom: DeconstructionRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "construction",
        label: "Construction",
        count: constructsInto.length + deconstructedFrom.length,
        showWhenEmpty,
        content: () => {
            const [conSelected, setConSelected] = createSignal<number>(0);
            const [deconSelected, setDeconSelected] = createSignal<number>(0);

            function onConSelected(cr: ConstructionRecipeDescV2) {
                const match = deconstructedFrom.findIndex(dr => dr.consumedBuilding === cr.buildingDescriptionId);
                setDeconSelected(match);
            }

            function onDeconSelected(dr: DeconstructionRecipeDesc) {
                const match = constructsInto.findIndex(cr => cr.buildingDescriptionId === dr.consumedBuilding);
                setConSelected(match);
            }

            return (
                <div class="space-y-4">
                    <Show when={constructsInto.length}>
                        <div>
                            <h4 class="text-sm text-muted-foreground mb-2">Builds into</h4>
                            <RecipeSelect
                                recipes={constructsInto}
                                nameFor={getConstructionRecipeName}
                                render={r => <ConstructionRecipePanel recipe={r}/>}
                                onSelect={onConSelected}
                                selectedIndex={conSelected}
                                renderSelectItem={renderKnowledgeLockedItem}
                            />
                        </div>
                    </Show>
                    <Show when={deconstructedFrom.length}>
                        <div>
                            <h4 class="text-sm text-muted-foreground mb-2">Deconstruction returns</h4>
                            <RecipeSelect
                                recipes={deconstructedFrom}
                                nameFor={getDeconstructionRecipeName}
                                render={r => <DeconstructionRecipePanel recipe={r}/>}
                                onSelect={onDeconSelected}
                                selectedIndex={deconSelected}
                            />
                        </div>
                    </Show>
                </div>
            );
        },
    };
}

export function conversionTab(inputs: ItemConversionRecipeDesc[], outputs: ItemConversionRecipeDesc[]): RelationshipTab {
    return {
        id: "conversion",
        label: "Conversion",
        count: inputs.length + outputs.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={outputs.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Converted from</h4>
                        <RecipeSelect
                            recipes={outputs}
                            nameFor={getConversionRecipeName}
                            render={r => <ConversionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
                <Show when={inputs.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Converts into</h4>
                        <RecipeSelect
                            recipes={inputs}
                            nameFor={getConversionRecipeName}
                            render={r => <ConversionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
            </div>
        ),
    };
}

export function travelerTasksTab(taskRewards: TravelerTaskDesc[], taskRequires: TravelerTaskDesc[]): RelationshipTab {
    return {
        id: "traveler-task",
        label: "Traveler Tasks",
        count: taskRequires.length + taskRewards.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={taskRewards.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Rewarded by</h4>
                        <RecipeSelect
                            recipes={taskRewards}
                            nameFor={getTravelerTaskName}
                            render={t => <TravelerTaskPanel task={t}/>}
                        />
                    </div>
                </Show>
                <Show when={taskRequires.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Required for</h4>
                        <RecipeSelect
                            recipes={taskRequires}
                            nameFor={getTravelerTaskName}
                            render={t => <TravelerTaskPanel task={t}/>}
                        />
                    </div>
                </Show>
            </div>
        ),
    };
}

export function travelerTradesTab(tradeOffers: TravelerTradeOrderDesc[], tradeRequires: TravelerTradeOrderDesc[]): RelationshipTab {
    return {
        id: "traveler-trade",
        label: "Traveler Trades",
        count: tradeRequires.length + tradeOffers.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={tradeOffers.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Offered by</h4>
                        <RecipeSelect
                            recipes={tradeOffers}
                            nameFor={getTravelerTradeName}
                            render={t => <TravelerTradePanel trade={t}/>}
                            renderSelectItem={renderKnowledgeLockedItem}
                        />
                    </div>
                </Show>
                <Show when={tradeRequires.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Required for</h4>
                        <RecipeSelect
                            recipes={tradeRequires}
                            nameFor={getTravelerTradeName}
                            render={t => <TravelerTradePanel trade={t}/>}
                            renderSelectItem={renderKnowledgeLockedItem}
                        />
                    </div>
                </Show>
            </div>
        ),
    };
}

export function itemListsTab(recipes: ItemListDesc[]): RelationshipTab {
    return {
        id: "item-lists",
        label: "In Item Lists",
        count: recipes.length,
        showWhenEmpty: false,
        content: () => (
            <RecipeSelect
                recipes={recipes}
                nameFor={getItemListName}
                render={l => <ItemListPanel list={l}/>}
            />
        ),
    };
}

export function itemListTab(list: ItemListDesc | undefined): RelationshipTab {
    return {
        id: "item-list",
        label: "Item List Output",
        count: list ? 1 : 0,
        showWhenEmpty: false,
        content: () => (
            <Show when={list} fallback={<h4 class="text-sm text-muted-foreground mb-2">Item list missing</h4>}>
                <RecipeSelect
                    recipes={[list!]}
                    nameFor={getItemListName}
                    render={l => <ItemListPanel list={l}/>}
                />
            </Show>
        ),
    }
}

export function enemyDropsTab(enemies: EnemyDesc[]): RelationshipTab {
    return {
        id: "enemy-drops",
        label: "Enemy Drops",
        count: enemies.length,
        showWhenEmpty: false,
        content: () => (
            <RecipeSelect
                recipes={enemies}
                nameFor={e => e.name}
                render={e => <EnemyDropPanel enemy={e}/>}
            />
        ),
    };
}

// ─── Single Recipe Tab Builders (for building page) ────────────

export function constructionCombinedSingleTab(
    constructionRecipe: ConstructionRecipeDescV2 | undefined,
    deconstructionRecipe: DeconstructionRecipeDesc | undefined,
): RelationshipTab {
    return {
        id: "construction",
        label: "Construction",
        count: (constructionRecipe ? 1 : 0) + (deconstructionRecipe ? 1 : 0),
        content: () => (
            <div class="space-y-4">
                <Show when={constructionRecipe} fallback={<h4 class="text-sm text-muted-foreground mb-2">No construction recipe</h4>}>{cr =>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Builds from</h4>
                        <ConstructionRecipePanel recipe={cr()}/>
                    </div>
                }</Show>
                <Show when={deconstructionRecipe} fallback={<h4 class="text-sm text-muted-foreground mb-2">No deconstruction recipe</h4>}>{dr =>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2">Deconstruction returns</h4>
                        <DeconstructionRecipePanel recipe={dr()}/>
                    </div>
                }</Show>
            </div>
        ),
    };
}

// ─── Quest Relation Tab Builders ────────────────────────────────

export function questRequirementsTab(quests: QuestChainDesc[]): RelationshipTab {
    return {
        id: "quest-requirements",
        label: "Required for Quests",
        count: quests.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<QuestChainDesc>
                data={quests}
                columns={[
                    {header: "Quest", cell: q => <QuestChainLink id={q.id} name={q.name}/>},
                ]}
            />
        ),
    };
}

export function questRewardsTab(quests: QuestChainDesc[]): RelationshipTab {
    return {
        id: "quest-rewards",
        label: "Rewarded from Quests",
        count: quests.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<QuestChainDesc>
                data={quests}
                columns={[
                    {header: "Quest", cell: q => <QuestChainLink id={q.id} name={q.name}/>},
                ]}
            />
        ),
    };
}

// ─── Placeable Tab Builders ─────────────────────────────────────
/*
export function placeablePlacementTab(
    placements: PlaceablePlacementDesc[],
    showWhenEmpty: boolean = false,
): RelationshipTab {
    return {
        id: "placeable-placement",
        label: "Placeable Placement",
        count: placements.length,
        showWhenEmpty,
        content: () => (
            <RecipeSelect
                recipes={placements}
                nameFor={getPlacementName}
                render={p => <PlacementPanel placement={p}/>}
                renderSelectItem={renderKnowledgeLockedItem}
            />
        ),
    };
}

export function placeableInteractionsTab(
    interactions: PlaceableInteractionDesc[],
    showWhenEmpty: boolean = false,
): RelationshipTab {
    return {
        id: "placeable-interactions",
        label: "Placeable Interactions",
        count: interactions.length,
        showWhenEmpty,
        content: () => (
            <RecipeSelect
                recipes={interactions}
                nameFor={getInteractionName}
                render={ia => <InteractionPanel interaction={ia}/>}
                renderSelectItem={renderKnowledgeLockedItem}
            />
        ),
    };
}
*/
