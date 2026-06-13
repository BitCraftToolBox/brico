/**
 * Recipe Display Components — Visual rendering for recipe/relationship data.
 *
 * Architecture:
 *   RecipeVisual       — Generic layout: inputs → arrow → outputs + stat lines
 *   *Panel             — Per-type recipe panels (thin wrappers around RecipeVisual)
 *   StatLineList       — Renders StatLine[] below a recipe visual
 *   RecipeSelect<T>    — Dropdown selector + panel for multiple same-type recipes
 *
 * Stat lines and naming come from lib/recipe-sources.ts and lib/relations.ts.
 * Stack rendering uses ItemStacks.tsx components.
 */

import {TbOutlineArrowBigDownLines as IconDown, TbOutlineLock as IconLock} from "solid-icons/tb";
import {Accessor, Component, createEffect, createSignal, For, JSX, Show} from "solid-js";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ExtractionSpawnedPlaceable} from "~/bindings/src/extraction_spawned_placeable_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {ProbabilisticItemStack} from "~/bindings/src/probabilistic_item_stack_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {BuildingIcon, EnemyIcon, ItemListSourceIcon, PlaceableIcon, ResourceIcon} from "~/components/shared/GameIcon";
import {expandStack, InputItemStackArray, ItemStackArray, ItemStackIcon, ProbBadge, QuestDropDisplay} from "~/components/shared/ItemStacks";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {
    collapseStacks,
    constructionStatLines,
    conversionStatLines,
    craftingStatLines,
    deconstructionStatLines,
    extractionStatLines,
    growthStatLines,
    interactionStatLines,
    placementStatLines,
    prospectingForResource,
    StatLine,
    travelerTaskStatLines,
    travelerTradeStatLines,
} from "~/lib/recipe-sources";
import {buildingForConstruction, buildingForDeconstruction, questDropsForEnemy, questDropsForExtraction, questDropsForItemList, resourceForExtraction} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

// ─── Stat Line Display ─────────────────────────────────────────

export const StatLineList: Component<{ stats: StatLine[] }> = (props) => (
    <Show when={props.stats.length}>
        <div class="flex flex-col items-center mt-4">
            <For each={props.stats}>
                {(pair) => (
                    <div class="flex flex-row w-full max-w-100">
                        <div class="text-nowrap mr-2">{pair[0]}</div>
                        <div class="dots-before flex flex-1 text-nowrap">{typeof pair[1] === "number" ? String(pair[1]) : pair[1]}</div>
                    </div>
                )}
            </For>
        </div>
    </Show>
);

// ─── Recipe Visual (generic layout) ────────────────────────────

interface RecipeVisualProps {
    inputs?: JSX.Element;
    outputs?: JSX.Element;
    stats?: StatLine[];
}

/** Generic inputs → ↓ → outputs + stat lines layout */
export const RecipeVisual: Component<RecipeVisualProps> = (props) => (
    <div class="flex flex-col min-w-1/2 justify-center">
        <Show when={props.inputs}>
            <div class="grid grid-flow-col grid-rows-1 justify-center">
                {props.inputs}
            </div>
        </Show>
        <Show when={props.inputs && props.outputs}>
            <div class="flex flex-row justify-center">
                <IconDown class="w-8 h-8 my-2"/>
            </div>
        </Show>
        <Show when={props.outputs}>
            <div class="flex flex-row flex-wrap sm:flex-nowrap justify-center">
                {props.outputs}
            </div>
        </Show>
        <Show when={props.stats}>
            <StatLineList stats={props.stats!}/>
        </Show>
    </div>
);

// ─── Crafting Recipe Panel ──────────────────────────────────────

export const CraftingRecipePanel: Component<{ recipe: CraftingRecipeDesc }> = (props) => (
    <RecipeVisual
        inputs={<InputItemStackArray stacks={props.recipe.consumedItemStacks}/>}
        outputs={
            <For each={props.recipe.craftedItemStacks} fallback={"No Outputs"}>
                {(stack) => expandStack(stack)}
            </For>
        }
        stats={craftingStatLines(props.recipe)}
    />
);

// ─── Extraction Recipe Panel ────────────────────────────────────

const ResourceDepletionIcons: Component<{ resource: ResourceDesc, showLabel: boolean }> = (props) => {
    const r = props.resource;
    const depletion = () => {
        if (!r?.onDestroyYield?.length) return undefined;
        // NB: Cargo drops from depletion in the data but have been ignored since at least the demo. I have been told it worked in alpha.
        // It seems intentional (https://github.com/clockworklabs/BitCraftPublic/blob/5510869539ca7b7342d10bd9d4a7c9d2c2a69489/BitCraftServer/packages/game/src/game/handlers/player/extract.rs#L454-L458)
        // but if it gets re-added just change false to true here
        const d = collapseStacks(r.onDestroyYield, false);
        return d.length ? d : undefined;
    }
    const depletionResource = () => {
        if (!r?.onDestroyYieldResourceId) return undefined;
        return BitCraftTables.ResourceDesc.indexedBy("id")()?.get(r.onDestroyYieldResourceId);
    }

    return (
        <div class="flex flex-row gap-2">
            <Show when={depletion()}>
                {(dep) =>
                    <div class="flex flex-col items-center gap-0.5">
                        {/* size and positioning copied from ProbItemStackIcon/ProbBadge to align with the extracted item stacks */}
                        <Show when={props.showLabel}>
                            <Tooltip>
                                <TooltipTrigger class="text-[10px] font-medium text-muted-foreground bg-muted/80 rounded px-1 py-px leading-tight">
                                    deplete
                                </TooltipTrigger>
                                <TooltipContent>
                                    Guaranteed drop on last hit of resource extraction
                                </TooltipContent>
                            </Tooltip>
                        </Show>
                        <ItemStackArray stacks={dep()} class="pt-1"/>
                    </div>
                }
            </Show>
            <Show when={depletionResource()}>
                {dR => {
                    const chance = props.resource.onDestroyYieldResourceChance;
                    const minRad = props.resource.onDestroyYieldResourceMinRadius;
                    const maxRad = props.resource.onDestroyYieldResourceMaxRadius;
                    const label = chance === 1 ? "deplete" : `${fixFloat(chance * 100)}%`;
                    const spawnText = chance === 1 ? "Guaranteed spawn" : "Chance to spawn";
                    const radText = minRad > 0 || maxRad > 0 ? ` within ${minRad}–${maxRad} tiles` : "";
                    const tooltipText = spawnText + radText + " on last hit of resource extraction.";
                    return (
                        <div class="flex flex-col items-center gap-0.5">
                            <Show when={props.showLabel}>
                                <Tooltip>
                                    <TooltipTrigger class="text-[10px] font-medium text-muted-foreground bg-muted/80 rounded px-1 py-px leading-tight">
                                        {label}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {tooltipText}
                                    </TooltipContent>
                                </Tooltip>
                            </Show>
                            <ResourceIcon res={dR()} small showFallbackText/>
                        </div>
                    )
                }}
            </Show>
        </div>
    );
}

const ExtractedPlaceableIcons: Component<{ drops: ExtractionSpawnedPlaceable[], showLabel: boolean, chances?: number }> = (props) => {
    const placeableIndex = BitCraftTables.PlaceableDesc.indexedBy("id");
    return (
        <For each={props.drops}>{esp => {
            const placeable = placeableIndex().get(esp.placeableId);
            if (!placeable) return null;
            const radText = esp.radiusMin > 0 || esp.radiusMax > 0 ? <><br/>Drops within {esp.radiusMin}–{esp.radiusMax} tiles.</> : "";
            return (
                <div class="flex flex-col items-center gap-0.5">
                    <Show when={props.showLabel}>
                        <ProbBadge probability={esp.chance} chances={props.chances} extraTooltip={radText}></ProbBadge>
                    </Show>
                    <PlaceableIcon placeable={placeable} small/>
                </div>
            )
        }}
        </For>
    );
}

export const ExtractionRecipePanel: Component<{ recipe: ExtractionRecipeDesc }> = (props) => {
    const resource = () => resourceForExtraction(props.recipe);
    const questDrops = () => questDropsForExtraction(props.recipe.id);

    return (
        <RecipeVisual
            inputs={
                <>
                    <InputItemStackArray stacks={props.recipe.consumedItemStacks}/>
                    <Show when={resource()}>
                        {(res) => <ResourceIcon res={res()} showFallbackText/>}
                    </Show>
                    <Show when={props.recipe.cargoId}>
                        <ItemStackIcon
                            stack={{itemId: props.recipe.cargoId, itemType: ItemType.Cargo, quantity: 1} as ItemStack}
                        />
                    </Show>
                </>
            }
            outputs={
                <>
                    <For each={props.recipe.extractedItemStacks.filter((s: ProbabilisticItemStack) => !!s)}
                         fallback={
                             <Show when={!resource()?.onDestroyYieldResourceId && !questDrops().length}>No Outputs</Show>
                         }
                    >
                        {(stack) => expandStack(stack,
                            resource()?.showTimeLeft || prospectingForResource(resource()?.id)?.length ? undefined : resource()?.maxHealth)
                        }
                    </For>
                    <Show when={props.recipe.spawnedPlaceables}>
                        {p => <ExtractedPlaceableIcons drops={p()} showLabel={true} chances={resource()?.maxHealth}/>}
                    </Show>
                    <Show when={resource()}>
                        {r => <ResourceDepletionIcons resource={r()} showLabel={true}/>}
                    </Show>
                    <For each={questDrops()}>
                        {(drop) => <QuestDropDisplay questDrop={drop} chances={resource()?.maxHealth}/>}
                    </For>
                </>
            }
            stats={extractionStatLines(props.recipe, resource())}
        />
    );
};

// ─── Construction Recipe Panel ──────────────────────────────────

export const ConstructionRecipePanel: Component<{ recipe: ConstructionRecipeDesc }> = (props) => {
    const building = () => buildingForConstruction(props.recipe);

    return (
        <RecipeVisual
            inputs={
                <InputItemStackArray
                    stacks={[...props.recipe.consumedItemStacks, ...props.recipe.consumedCargoStacks]}
                />
            }
            outputs={
                <Show when={building()} fallback={<span class="text-muted-foreground">Building #{props.recipe.buildingDescriptionId}</span>}>
                    {(b) => (
                        <BuildingIcon building={b()} small/>
                    )}
                </Show>
            }
            stats={constructionStatLines(props.recipe)}
        />
    );
};

// ─── Deconstruction Recipe Panel ────────────────────────────────

export const DeconstructionRecipePanel: Component<{ recipe: DeconstructionRecipeDesc }> = (props) => {
    const building = () => buildingForDeconstruction(props.recipe);

    return (
        <RecipeVisual
            inputs={
                <Show when={building()} fallback={<span class="text-muted-foreground">Building #{props.recipe.consumedBuilding}</span>}>
                    {(b) => (
                        <BuildingIcon building={b()} small/>
                    )}
                </Show>
            }
            outputs={<ItemStackArray stacks={props.recipe.outputItemStacks}/>}
            stats={deconstructionStatLines(props.recipe)}
        />
    );
};

// ─── Conversion Recipe Panel ────────────────────────────────────

export const ConversionRecipePanel: Component<{ recipe: ItemConversionRecipeDesc }> = (props) => (
    <RecipeVisual
        inputs={<ItemStackArray stacks={props.recipe.inputItems}/>}
        outputs={
            <Show when={props.recipe.outputItem} fallback={"No Output"}>
                {(out) => expandStack(out())}
            </Show>
        }
        stats={conversionStatLines(props.recipe)}
    />
);

// ─── Traveler Task Panel ────────────────────────────────────────

export const TravelerTaskPanel: Component<{ task: TravelerTaskDesc }> = (props) => (
    <RecipeVisual
        inputs={<ItemStackArray stacks={props.task.requiredItems}/>}
        outputs={<ItemStackArray stacks={props.task.rewardedItems}/>}
        stats={travelerTaskStatLines(props.task)}
    />
);

// ─── Traveler Trade Panel ───────────────────────────────────────

export const TravelerTradePanel: Component<{ trade: TravelerTradeOrderDesc }> = (props) => {
    return (
        <RecipeVisual
            inputs={<ItemStackArray stacks={props.trade.requiredItems}/>}
            outputs={<ItemStackArray stacks={props.trade.offerItems}/>}
            stats={travelerTradeStatLines(props.trade)}
        />
    );
};

// ─── Resource Depletion Panel ───────────────────────────────────

export const ResourceDepletionPanel: Component<{ resource: ResourceDesc }> = (props) => {
    return (
        <RecipeVisual
            inputs={<ResourceIcon res={props.resource} showFallbackText/>}
            outputs={<ResourceDepletionIcons resource={props.resource} showLabel={true}/>}
        />
    );
};

// ─── Item List Panel ────────────────────────────────────────────

export const ItemListPanel: Component<{ list: ItemListDesc }> = (props) => {
    const questDrops = () => questDropsForItemList(props.list.id);
    const listComp = expandStack(props.list);
    return (
        <RecipeVisual
            inputs={<ItemListSourceIcon list={props.list}/>}
            outputs={
                <>
                    <Show when={questDrops().length} fallback={listComp}>
                        <div class="mt-4">{listComp}</div>
                    </Show>
                    <For each={questDrops()}>
                        {(drop) => <QuestDropDisplay questDrop={drop}/>}
                    </For>
                </>
            }
        />
    );
};

// ─── Enemy Drop Panel ───────────────────────────────────────────

/** Renders an enemy as the input with its extracted item drops + quest drops as outputs. */
export const EnemyDropPanel: Component<{ enemy: EnemyDesc }> = (props) => {
    const questDrops = () => questDropsForEnemy(props.enemy.enemyType);

    return (
        <RecipeVisual
            inputs={<EnemyIcon enemy={props.enemy} small noInteract/>}
            outputs={
                <>
                    <For each={props.enemy.extractedItemStacks} fallback={
                        <Show when={!questDrops().length}>
                            <span class="text-muted-foreground text-sm">No drops</span>
                        </Show>
                    }>
                        {(stack) => expandStack(stack, 1)}
                    </For>
                    <For each={questDrops()}>
                        {(drop) => <QuestDropDisplay questDrop={drop} chances={1}/>}
                    </For>
                </>
            }
        />
    );
};

// ─── Recipe Select (generic multi-recipe selector) ──────────────

type SelectOption = { label: string; value: string };

interface RecipeSelectProps<T> {
    recipes: T[];
    nameFor: (r: T) => string;
    render: (recipe: T) => JSX.Element;
    renderSelectItem?: (recipe: T, item: any) => JSX.Element;
    onSelect?: (recipe: T) => void;
    selectedIndex?: Accessor<number>;
}

/**
 * Dropdown selector + panel for rendering one recipe at a time from a list.
 * Shows just the panel when there's only one recipe; shows dropdown when multiple.
 */
export function RecipeSelect<T>(props: RecipeSelectProps<T>) {
    const options = () => props.recipes.map((_, i) => ({
        label: props.nameFor(props.recipes[i]),
        value: String(i),
    } as SelectOption));

    const [selected, setSelected] = createSignal<SelectOption | undefined>(
        options().length ? options()[0] : {label: "None", value: ""}
    );

    createEffect(() => {
        const fromAbove = props.selectedIndex?.();
        if (typeof fromAbove === "undefined") return;
        if (fromAbove >= 0) {
            setSelected(options()[fromAbove]);
        } else {
            setSelected(undefined);
        }
    })

    return (
        <Show when={props.recipes.length}>
            <div class="flex flex-col gap-2 align-items-center">
                <Show when={props.recipes.length > 1} fallback={
                    <div class="text-center w-full h-10 text-sm">{props.nameFor(props.recipes[0])}</div>
                }>
                    <Select<SelectOption>
                        value={selected()}
                        onChange={(v) => {
                            const opt = options().find(o => o.value === v?.value);
                            if (opt) {
                                setSelected(opt);
                                const idx = parseInt(opt.value ?? "0", 10);
                                props.onSelect?.(props.recipes[idx]);
                            }
                        }}
                        options={options()}
                        optionValue="value"
                        optionTextValue="label"
                        placeholder="Select a recipe"
                        itemComponent={(itemProps) => {
                            if (props.renderSelectItem) {
                                const idx = parseInt(itemProps.item.key, 10);
                                if (idx < 0 || idx > props.recipes.length) {
                                    return <></>;
                                }
                                const recipe = props.recipes[idx] as any;
                                return props.renderSelectItem(recipe, itemProps);
                            }
                            return <SelectItem item={itemProps.item}>{itemProps.item.textValue}</SelectItem>;
                        }}
                        class="flex flex-row justify-center"
                    >
                        <SelectTrigger aria-label="Recipe option" class="w-auto min-w-1/2">
                            <SelectValue<SelectOption> class="flex flex-row w-full">
                                {(state) => (
                                    <>
                                        <div class="text-balance">{state.selectedOption()?.label}</div>
                                        <span class="ml-auto pl-2 mr-2 place-self-center">
                                            {options().findIndex(o => o.value === state.selectedOption()?.value) + 1}/{options().length}
                                        </span>
                                    </>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent class="max-h-100 overflow-y-auto"/>
                    </Select>
                </Show>
                <Show when={selected()} keyed>
                    {(r) => {
                        const idx = parseInt(r.value ?? "0", 10);
                        return props.render(props.recipes[idx]);
                    }}
                </Show>
            </div>
        </Show>
    );
}

const AOC_ID: number = 12345; // Art of Cheating knowledge ID

export const renderKnowledgeLockedItem = <T extends {requiredKnowledges: number[]}>(recipe: T, item: any) => {
    if (recipe.requiredKnowledges.includes(AOC_ID)) {
        return <SelectItem item={item.item}><div class="flex flex-row gap-1 items-center"><span>{item.item.textValue}</span> <IconLock color="red"/></div></SelectItem>;
    }
    return <SelectItem item={item.item}>{item.item.textValue}</SelectItem>;
}

// ─── Placeable Placement Panel ──────────────────────────────────

export const PlacementPanel: Component<{ placement: PlaceablePlacementDesc }> = (props) => {
    const placeable = () => BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(props.placement.placedPlaceableId);

    return (
        <RecipeVisual
            inputs={
                <ItemStackIcon stack={props.placement.inputItem}/>
            }
            outputs={
                <Show when={placeable()} fallback={<span class="text-muted-foreground">Placeable #{props.placement.placedPlaceableId}</span>}>
                    {(p) => <PlaceableIcon placeable={p()} small/>}
                </Show>
            }
            stats={placementStatLines(props.placement)}
        />
    );
};

// ─── Placeable Interaction Panel ────────────────────────────────

export const InteractionPanel: Component<{ interaction: PlaceableInteractionDesc }> = (props) => {
    const placeable = () => BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(props.interaction.placeableId);
    const spawnedPlaceable = () => {
        const id = props.interaction.onDestroySpawnedPlaceableId;
        if (!id) return undefined;
        return BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(id);
    };

    return (
        <RecipeVisual
            inputs={
                <>
                    <Show when={placeable()}>
                        {(p) => (
                            <div class="flex flex-col items-center gap-0.5">
                                <PlaceableIcon placeable={p()} small/>
                                <span class="text-[10px] text-muted-foreground text-center max-w-14 leading-tight truncate" title={p().name}>{p().name}</span>
                            </div>
                        )}
                    </Show>
                    <Show when={props.interaction.consumedItemStacks.length}>
                        <InputItemStackArray stacks={props.interaction.consumedItemStacks}/>
                    </Show>
                </>
            }
            outputs={
                <>
                    <Show when={props.interaction.outputItemStacks.length}>
                        <ItemStackArray stacks={props.interaction.outputItemStacks}/>
                    </Show>
                    <Show when={spawnedPlaceable()}>
                        {(sp) => (
                            <div class="flex flex-col items-center gap-0.5">
                                <Show when={props.interaction.onDestroySpawnedPlaceableChance < 1}>
                                    <span class="text-[10px] font-medium text-muted-foreground bg-muted/80 rounded px-1 py-px leading-tight">
                                        {Math.round(props.interaction.onDestroySpawnedPlaceableChance * 100)}%
                                    </span>
                                </Show>
                                <PlaceableIcon placeable={sp()} small/>
                                <span class="text-[10px] text-muted-foreground text-center max-w-14 leading-tight truncate" title={sp().name}>{sp().name}</span>
                            </div>
                        )}
                    </Show>
                </>
            }
            stats={interactionStatLines(props.interaction)}
        />
    );
};

// ─── Placeable Growth Panel ─────────────────────────────────────

const GrowthOutcomeIcon: Component<{
    placeableId: number;
    probability: number;
    totalWeight: number;
    showPercent: Accessor<boolean>;
    onTogglePercent: () => void;
}> = (props) => {
    const placeable = () => BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(props.placeableId);
    const pct = () => (props.probability / props.totalWeight) * 100;

    return (
        <div class="flex flex-col items-center gap-0.5">
            <Show when={props.placeableId !== 0}>
                <button
                    class="text-[10px] font-medium text-muted-foreground bg-muted/80 rounded px-1 py-px leading-tight hover:bg-muted cursor-pointer transition-colors"
                    onClick={props.onTogglePercent}
                    title="Click to toggle between percentage and weight"
                >
                    {props.showPercent() ? `${pct().toFixed(1)}%` : props.probability}
                </button>
            </Show>
            <Show when={placeable()} fallback={<span class="text-xs text-muted-foreground">{props.placeableId === 0 ? "Despawn" : `#${props.placeableId}`}</span>}>
                {(p) => <PlaceableIcon placeable={p()} small/>}
            </Show>
            <Show when={placeable()}>
                {(p) => <span class="text-[10px] text-muted-foreground text-center max-w-14 leading-tight truncate" title={p().name}>{p().name}</span>}
            </Show>
        </div>
    );
};

export const GrowthPanel: Component<{ growth: PlaceableGrowthDesc }> = (props) => {
    const [showPercent, setShowPercent] = createSignal(true);
    const placeable = () => BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(props.growth.placeableId);
    const totalWeight = () => props.growth.outcomes.reduce((sum, o) => sum + o.probability, 0);

    return (
        <RecipeVisual
            inputs={
                <Show when={placeable()}>
                    {(p) => (
                        <div class="flex flex-col items-center gap-0.5">
                            <PlaceableIcon placeable={p()} small/>
                            <span class="text-[10px] text-muted-foreground text-center max-w-14 leading-tight truncate" title={p().name}>{p().name}</span>
                        </div>
                    )}
                </Show>
            }
            outputs={
                <div class="flex flex-row flex-wrap gap-2 justify-center">
                    <For each={props.growth.outcomes}>
                        {(outcome) => (
                            <GrowthOutcomeIcon
                                placeableId={outcome.placeableId}
                                probability={outcome.probability}
                                totalWeight={totalWeight()}
                                showPercent={showPercent}
                                onTogglePercent={() => setShowPercent(p => !p)}
                            />
                        )}
                    </For>
                </div>
            }
            stats={growthStatLines(props.growth)}
        />
    );
};
