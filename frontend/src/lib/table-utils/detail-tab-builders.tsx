/**
 * Reusable Detail Tab Builders
 *
 * Provides factory functions for common recipe/relationship tabs
 * shared across multiple detail pages.
 */

import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createSignal, Show} from "solid-js";
import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {TerraformRecipeDesc} from "~/bindings/src/terraform_recipe_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {RelationshipTab, RelTable} from "~/components/shared/DetailPageLayout";
import {ProbabilisticItemStackArray} from "~/components/shared/ItemStacks";
import {
    ConstructionRecipePanel,
    ConversionRecipePanel,
    CraftingRecipePanel,
    DeconstructionRecipePanel,
    EnemyDropPanel,
    ExtractionRecipePanel,
    InteractionPanel,
    ItemListPanel,
    PlacementPanel,
    RecipeSelect,
    renderKnowledgeLockedItem,
    ResourceDepletionPanel,
    TravelerTaskPanel,
    TravelerTradePanel,
} from "~/components/shared/RecipeDisplay";
import {Button} from "~/components/ui/button";
import {
    AchievementLink,
    BuildingLink,
    CargoLink,
    CollectibleLink,
    IconLink,
    IconSpan,
    ItemLink,
    ItemStackLink,
    LinkedList,
    pageIcon,
    PlaceableLink,
    QuestChainLink,
    ResourceLink,
    SkillLinkById,
} from "~/lib/game-links";
import {i18n, trackUILocale} from "~/lib/i18n";
import {gameText} from "~/lib/labels";
import {getInteractionName, getPlacementName} from "~/lib/placeables";
import {
    AchievementRequirement,
    buildingForConstruction,
    getConstructionRecipeName,
    getConversionRecipeName,
    getCraftingRecipeName,
    getDeconstructionRecipeName,
    getExtractionRecipeName,
    getItemListName,
    getResourceDepletionName,
    getTravelerTaskName,
    getTravelerTradeName,
    KnowledgeUsage,
    resourceForExtraction,
} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

// ─── Individual Recipe Tab Builders ─────────────────────────────────

export function craftedFromTab(
    recipes: CraftingRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "crafted-from",
        label: msg`Crafted From`,
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
        label: msg`Crafts Into`,
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

export function terraformDropsTab(
    recipes: TerraformRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "terraforming",
        label: msg`Terraforming Drops`,
        count: recipes.length,
        showWhenEmpty,
        content: () => (
            <RelTable data={recipes} columns={[
                {header: msg`Elevation Difference`, cell: tr => (
                    <Button variant="ghost" class="w-full" as={A} href={`/database/terraforming/${tr.difference}`}>{tr.difference}</Button>
                )},
                {header: msg`Drops`, cell: tr => (
                    <Show when={tr.outputItemStacks?.length}>
                        <ProbabilisticItemStackArray stacks={tr.outputItemStacks!}/>
                    </Show>
                )}
            ]}/>
        )
    }
}

export function extractionTab(
    drops: ExtractionRecipeDesc[],
    uses: ExtractionRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "extraction",
        label: msg`Extraction`,
        count: drops.length + uses.length,
        showWhenEmpty,
        content: () => (
            <div class="space-y-4">
                <Show when={drops.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Dropped from</Trans></h4>
                        <RecipeSelect
                            recipes={drops}
                            nameFor={getExtractionRecipeName}
                            render={r => <ExtractionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
                <Show when={uses.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Used in</Trans></h4>
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
        label: msg`Resource Depletion`,
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
    constructsInto: ConstructionRecipeDesc[],
    deconstructedFrom: DeconstructionRecipeDesc[],
    showWhenEmpty: boolean = false
): RelationshipTab {
    return {
        id: "construction",
        label: msg`Construction`,
        count: constructsInto.length + deconstructedFrom.length,
        showWhenEmpty,
        content: () => {
            const [conSelected, setConSelected] = createSignal<number>(0);
            const [deconSelected, setDeconSelected] = createSignal<number>(0);

            function onConSelected(cr: ConstructionRecipeDesc) {
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
                            <h4 class="text-sm text-muted-foreground mb-2"><Trans>Builds into</Trans></h4>
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
                            <h4 class="text-sm text-muted-foreground mb-2"><Trans>Deconstruction returns</Trans></h4>
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
        label: msg`Conversion`,
        count: inputs.length + outputs.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={outputs.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Converted from</Trans></h4>
                        <RecipeSelect
                            recipes={outputs}
                            nameFor={getConversionRecipeName}
                            render={r => <ConversionRecipePanel recipe={r}/>}
                        />
                    </div>
                </Show>
                <Show when={inputs.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Converts into</Trans></h4>
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
        label: msg`Traveler Tasks`,
        count: taskRequires.length + taskRewards.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={taskRewards.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Rewarded by</Trans></h4>
                        <RecipeSelect
                            recipes={taskRewards}
                            nameFor={getTravelerTaskName}
                            render={t => <TravelerTaskPanel task={t}/>}
                        />
                    </div>
                </Show>
                <Show when={taskRequires.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Required for</Trans></h4>
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
        label: msg`Traveler Trades`,
        count: tradeRequires.length + tradeOffers.length,
        showWhenEmpty: false,
        content: () => (
            <div class="space-y-4">
                <Show when={tradeOffers.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Offered by</Trans></h4>
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
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Required for</Trans></h4>
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
        label: msg`In Item Lists`,
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
        label: msg`Item List Output`,
        count: list ? 1 : 0,
        showWhenEmpty: false,
        content: () => (
            <Show when={list} fallback={<h4 class="text-sm text-muted-foreground mb-2"><Trans>Item list missing</Trans></h4>}>
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
        label: msg`Enemy Drops`,
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

export function collectiblesTab(collectibles: CollectibleDesc[]) : RelationshipTab {
    return {
        id: "collectibles",
        label: msg`Collectibles`,
        count: collectibles.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<CollectibleDesc>
                data={collectibles}
                columns={[
                    {header: msg`Collectible`, cell: c => <CollectibleLink id={c.id} name={c.name}/>},
                ]}
            />
        ),
    }
}

export function claimResearchTab(techs: ClaimTechDesc[]) : RelationshipTab {
    return {
        id: "claim-tech",
        label: gameText(msg`Claim Research`, "Research"),
        count: techs.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<ClaimTechDesc>
                data={techs}
                columns={[
                    {header: gameText(msg`Claim Research`, "Research"), cell: c => (
                        <IconLink href={`/database/claim-research/${c.id}`} icon={pageIcon("Claim Research")}>
                            {c.name}
                        </IconLink>
                    )},
                    {header: gameText(msg`Requires`, "Requires "), cell: c => (
                        <LinkedList>
                            {
                                c.input.map(is => <ItemStackLink stack={is}/>)
                                    .concat(c.suppliesCost > 0 ? [<IconSpan><Trans>Supplies</Trans> <span class="text-muted-foreground">×{c.suppliesCost}</span></IconSpan>] : [])
                            }
                        </LinkedList>
                    )}
                ]}
            />
        ),
    }
}

// ─── Single Recipe Tab Builders (for building page) ────────────

export function constructionCombinedSingleTab(
    constructionRecipe: ConstructionRecipeDesc | undefined,
    deconstructionRecipe: DeconstructionRecipeDesc | undefined,
): RelationshipTab {
    return {
        id: "construction",
        label: msg`Construction`,
        count: (constructionRecipe ? 1 : 0) + (deconstructionRecipe ? 1 : 0),
        content: () => (
            <div class="space-y-4">
                <Show when={constructionRecipe} fallback={<h4 class="text-sm text-muted-foreground mb-2"><Trans>No construction recipe</Trans></h4>}>{cr =>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Builds from</Trans></h4>
                        <ConstructionRecipePanel recipe={cr()}/>
                    </div>
                }</Show>
                <Show when={deconstructionRecipe} fallback={<h4 class="text-sm text-muted-foreground mb-2"><Trans>No deconstruction recipe</Trans></h4>}>{dr =>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Deconstruction returns</Trans></h4>
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
        label: msg`Required for Quests`,
        count: quests.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<QuestChainDesc>
                data={quests}
                columns={[
                    {header: gameText(msg`Quest`), cell: q => <QuestChainLink id={q.id} name={q.name}/>},
                ]}
            />
        ),
    };
}

export function questRewardsTab(quests: QuestChainDesc[]): RelationshipTab {
    return {
        id: "quest-rewards",
        label: msg`Rewarded from Quests`,
        count: quests.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<QuestChainDesc>
                data={quests}
                columns={[
                    {header: gameText(msg`Quests`), cell: q => <QuestChainLink id={q.id} name={q.name}/>},
                ]}
            />
        ),
    };
}

// ─── Achievement Requirement Tab ─────────────────────────────────

const ACHIEVEMENT_REQUIREMENT_TYPE_LABELS: Record<AchievementRequirement["type"], MessageDescriptor> = {
    achievement: msg`Achievement`,
    skill: msg`Skill`,
    resource: msg`Discover Resource`,
    cargo: msg`Discover Cargo`,
    item: msg`Discover Item`,
    crafting: msg`Craft`,
    chunks: msg`Explore`,
};

function achievementRequirementTypeLabel(type: AchievementRequirement["type"]): string {
    trackUILocale();
    return i18n._(ACHIEVEMENT_REQUIREMENT_TYPE_LABELS[type]);
}

function achievementRequirementTarget(req: AchievementRequirement) {
    switch (req.type) {
        case "achievement":
            return <AchievementLink id={req.achievement.id} name={req.achievement.name}/>;
        case "skill":
            return (
                <span class="inline-flex items-center gap-1">
                    <SkillLinkById skillId={req.skillId}/> <span class="text-muted-foreground"><Trans>Lvl. {req.skillLevel}</Trans></span>
                </span>
            );
        case "resource":
            return <ResourceLink id={req.resource.id} name={req.resource.name}/>;
        case "cargo":
            return <CargoLink id={req.cargo.id} name={req.cargo.name}/>;
        case "item":
            return <ItemLink id={req.item.id} name={req.item.name}/>;
        case "crafting":
            return <span>{getCraftingRecipeName(req.recipe)}</span>;
        case "chunks":
            return req.pctChunksDiscovered
                ? <Trans>{fixFloat(req.pctChunksDiscovered)}% of chunks</Trans>
                : <Plural value={req.chunksDiscovered} one="# chunk" other="# chunks"/>;
    }
}

export function achievementRequirementsTab(requirements: AchievementRequirement[]): RelationshipTab {
    return {
        id: "requirements",
        label: gameText(msg`Requires`),
        count: requirements.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<AchievementRequirement>
                data={requirements}
                columns={[
                    {header: msg`Type`, cell: req => <span>{achievementRequirementTypeLabel(req.type)}</span>},
                    {header: msg`Requirement`, cell: achievementRequirementTarget},
                ]}
            />
        ),
    };
}

// ─── Placeable Tab Builders ─────────────────────────────────────

export function placeablePlacementTab(
    placements: PlaceablePlacementDesc[],
    showWhenEmpty: boolean = false,
): RelationshipTab {
    return {
        id: "placeable-placement",
        label: msg`Placeable Placement`,
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
        label: msg`Placeable Interactions`,
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

/**
 * Combined interactions tab for a single placeable - separates interactions performed
 * on this placeable from interactions on other placeables that spawn this one on destroy
 */
export function placeableInteractionsCombinedTab(
    interactionsWith: PlaceableInteractionDesc[],
    interactionsResultingIn: PlaceableInteractionDesc[],
    showWhenEmpty: boolean = false,
): RelationshipTab {
    return {
        id: "interactions",
        label: msg`Interactions`,
        count: interactionsWith.length + interactionsResultingIn.length,
        showWhenEmpty,
        content: () => (
            <div class="space-y-4">
                <Show when={interactionsWith.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Interact with this placeable</Trans></h4>
                        <RecipeSelect
                            recipes={interactionsWith}
                            nameFor={getInteractionName}
                            render={ia => <InteractionPanel interaction={ia}/>}
                        />
                    </div>
                </Show>
                <Show when={interactionsResultingIn.length}>
                    <div>
                        <h4 class="text-sm text-muted-foreground mb-2"><Trans>Result of other placeable interaction</Trans></h4>
                        <RecipeSelect
                            recipes={interactionsResultingIn}
                            nameFor={getInteractionName}
                            render={ia => <InteractionPanel interaction={ia}/>}
                        />
                    </div>
                </Show>
            </div>
        ),
    };
}

// ─── Knowledge Usage Tab ─────────────────────────────────────────

const KNOWLEDGE_USAGE_TYPE_LABELS: Record<KnowledgeUsage["type"], MessageDescriptor> = {
    collectible: msg`Collectible`,
    constructionRecipe: msg`Construction Recipe`,
    craftingRecipe: msg`Crafting Recipe`,
    equipment: msg`Equipment`,
    extractionRecipe: msg`Extraction Recipe`,
    pavingTile: msg`Paving Tile`,
    placeableInteraction: msg`Placeable Interaction`,
    placeablePlacement: msg`Placeable Placement`,
    resourcePlacementRecipe: msg`Resource Placement Recipe`,
    travelerTrade: msg`Traveler Trade`,
    travelerTaskKnowledgeRequirement: msg`Traveler Task`,
};

function usageTypeLabel(type: KnowledgeUsage["type"]): string {
    trackUILocale();
    return i18n._(KNOWLEDGE_USAGE_TYPE_LABELS[type]);
}

function knowledgeUsageLink(usage: KnowledgeUsage) {
    switch (usage.type) {
        case "collectible":
            return <CollectibleLink id={usage.collectible.id} name={usage.collectible.name}/>;
        case "constructionRecipe": {
            const building = buildingForConstruction(usage.constructionRecipe);
            return building
                ? <BuildingLink id={building.id} name={building.name}/>
                : <span class="text-muted-foreground">Building #{usage.constructionRecipe.buildingDescriptionId}</span>;
        }
        case "craftingRecipe": {
            const stack = usage.craftingRecipe.craftedItemStacks[0];
            const name = getCraftingRecipeName(usage.craftingRecipe);
            if (!stack) return <span>{name}</span>;
            return stack.itemType.tag === ItemType.Cargo.tag
                ? <CargoLink id={stack.itemId} name={name}/>
                : <ItemLink id={stack.itemId} name={name}/>;
        }
        case "equipment": {
            const item = BitCraftTables.ItemDesc.indexedBy("id")().get(usage.equipment.itemId);
            return <ItemLink id={usage.equipment.itemId} name={item?.name}/>;
        }
        case "extractionRecipe": {
            const resource = resourceForExtraction(usage.extractionRecipe);
            return resource
                ? <IconLink href={`/database/resource/${resource.id}`} icon={pageIcon("Resources")}>{getExtractionRecipeName(usage.extractionRecipe)}</IconLink>
                : <span class="text-muted-foreground">{getExtractionRecipeName(usage.extractionRecipe)}</span>;
        }
        case "pavingTile":
            return <IconLink href={`/database/paving/${usage.pavingTile.id}`} icon={pageIcon("Paving")}>{usage.pavingTile.name}</IconLink>;
        case "placeableInteraction":
            return <PlaceableLink id={usage.placeableInteraction.placeableId}/>;
        case "placeablePlacement":
            return <PlaceableLink id={usage.placeablePlacement.placedPlaceableId}/>;
        case "resourcePlacementRecipe": {
            const resourceId = usage.resourcePlacementRecipe.resourceDescriptionId;
            const resource = BitCraftTables.ResourceDesc.indexedBy("id")().get(resourceId);
            return <IconLink href={`/database/resource/${resourceId}`} icon={pageIcon("Resources")}>{resource?.name ?? usage.resourcePlacementRecipe.name}</IconLink>;
        }
        case "travelerTrade":
            return <IconLink href={`/database/traveler-trade/${usage.travelerTrade.id}`} icon={pageIcon("Traveler Trades")}>{getTravelerTradeName(usage.travelerTrade)}</IconLink>;
        case "travelerTaskKnowledgeRequirement": {
            const taskId = usage.travelerTaskKnowledgeRequirement.travelerTaskId;
            const task = BitCraftTables.TravelerTaskDesc.indexedBy("id")().get(taskId);
            const label = task ? getTravelerTaskName(task) : `Traveler Task #${taskId}`;
            return <IconLink href={`/database/traveler-task/${taskId}`} icon={pageIcon("Traveler Tasks")}>{label}</IconLink>;
        }
    }
}

export function knowledgeUsedByTab(usages: KnowledgeUsage[]): RelationshipTab {
    return {
        id: "used-by",
        label: msg`Used By`,
        count: usages.length,
        showWhenEmpty: false,
        content: () => (
            <RelTable<KnowledgeUsage>
                data={usages}
                columns={[
                    {header: msg`Type`, cell: usage => <span>{usageTypeLabel(usage.type)}</span>},
                    {header: msg`Used By`, cell: knowledgeUsageLink},
                ]}
            />
        ),
    };
}

