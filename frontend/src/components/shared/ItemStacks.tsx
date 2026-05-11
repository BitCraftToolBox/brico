/**
 * ItemStacks — Components for rendering item/cargo stacks and related types.
 *
 * Component hierarchy:
 *   ItemStackIcon       — Single ItemStack with icon + quantity badge
 *   ProbItemStackIcon   — ProbabilisticItemStack: icon + probability + quantity
 *   ItemListDisplay     — Weighted item list: average outputs with popover detail
 *   ItemStackArray      — Row of ItemStackIcons
 *   expandStack()       — Smart dispatcher: resolves item lists, renders the right component
 */

import {A} from "@solidjs/router";
import {Component, createMemo, For, JSX, Show} from "solid-js";
import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import {InputItemStack} from "~/bindings/src/input_item_stack_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemListPossibility} from "~/bindings/src/item_list_possibility_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {ProbabilisticItemStack} from "~/bindings/src/probabilistic_item_stack_type";
import {QuestDropDesc} from "~/bindings/src/quest_drop_desc_type";
import {CargoIcon, ItemIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {QuestChainLinkById} from "~/lib/game-links";
import {useSettings} from "~/lib/settings";
import {BitCraftTables} from "~/lib/spacetime";
import {cn, fixFloat} from "~/lib/utils";

// ─── Utility ────────────────────────────────────────────────────

/** Resolve an ItemStack's itemId + itemType to the actual ItemDesc or CargoDesc */
function resolveStack(itemId: number, itemType: ItemType): ItemDesc | CargoDesc | undefined {
    if (itemType.tag === ItemType.Item.tag) {
        return BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(itemId);
    } else if (itemType.tag === ItemType.Cargo.tag) {
        return BitCraftTables.CargoDesc.indexedBy("id")?.()?.get(itemId);
    }
    return undefined;
}

function isItem(obj: ItemDesc | CargoDesc): obj is ItemDesc {
    return !("carriedModelAssetName" in obj);
}

/** Format a quantity for display. Omit if 1 and hideSingle is true. */
function formatQty(qty: number, hideSingle?: boolean): string {
    if (qty === 1 && hideSingle) return "";
    return Number.isInteger(qty) ? String(qty) : fixFloat(qty, 5).toString();
}

// ─── ItemStackIcon ─────────────────────────────────────────────
// Renders a single ItemStack: icon (delegated to ItemIcon/CargoIcon) + quantity

export interface ItemStackIconProps {
    stack: ItemStack | InputItemStack;
    small?: boolean;
    noInteract?: boolean;
    hideSingle?: boolean;
    showName?: boolean;
    /** Override quantity display (for averaged amounts) */
    displayQty?: number;
    class?: string;
}

export const ItemStackIcon: Component<ItemStackIconProps> = (props) => {
    const resolved = createMemo(() => resolveStack(props.stack.itemId, props.stack.itemType));

    const qty = () => props.displayQty ?? props.stack.quantity;
    const qtyText = () => formatQty(qty(), props.hideSingle);

    return (
        <Show when={resolved()}>
            {(obj) => {
                const nameText = () => {
                    const q = qtyText();
                    if (!props.showName) return q;
                    return q ? `${q}× ${obj().name}` : obj().name;
                };

                return (
                    <div class={cn("flex flex-col items-center gap-0.5", props.class)}>
                        <Show when={isItem(obj())} fallback={
                            <CargoIcon cargo={obj() as CargoDesc} quantity={qty()} small={props.small ?? true} noInteract={props.noInteract}/>
                        }>
                            <ItemIcon item={obj() as ItemDesc} quantity={qty()} small={props.small ?? true} noInteract={props.noInteract}/>
                        </Show>
                        <Show when={nameText()}>
                            <span class="text-xs text-center leading-tight max-w-20 truncate" title={obj().name}>
                                {nameText()}
                            </span>
                        </Show>
                    </div>
                );
            }}
        </Show>
    );
};

// ─── Probability Badge ─────────────────────────────────────────

function ProbBadge(props: { probability: number, chances?: number }) {
    const { displayProbabilityAsAverage, setDisplayProbabilityAsAverage } = useSettings();
    const pct = () => fixFloat(props.probability * 100, 2);
    const ev = () => props.chances ? fixFloat(props.probability * props.chances) : undefined;
    const badgeClass = "text-[10px] font-medium text-muted-foreground bg-muted/80 rounded px-1 py-px leading-tight cursor-pointer";
    return (
        <Show when={props.chances === 1} fallback={
            <Show when={displayProbabilityAsAverage() && props.chances !== undefined} fallback={
                <Tooltip>
                    <TooltipTrigger class={badgeClass} onclick={() => setDisplayProbabilityAsAverage(!displayProbabilityAsAverage())}>
                        {pct()}%
                    </TooltipTrigger>
                    <TooltipContent>
                        Chance per progress (HP/damage/etc.) of this drop. Each point rolls independently.
                    </TooltipContent>
                </Tooltip>
            }>
                <Tooltip>
                    <TooltipTrigger class={badgeClass} onclick={() => setDisplayProbabilityAsAverage(!displayProbabilityAsAverage())}>
                        {ev()}
                    </TooltipTrigger>
                    <TooltipContent>
                        Average number of drops for a full bar (resource health, dungeon contribution, etc.): {fixFloat(props.probability * 100)}% * {props.chances} = {ev()}.
                    </TooltipContent>
                </Tooltip>
            </Show>
        }>
            <div class={badgeClass}>{pct()}%</div>
        </Show>
    );
}

// ─── ProbItemStackIcon ─────────────────────────────────────────
// A ProbabilisticItemStack: probability badge on top, then the icon + qty.
// If the inner item has an itemListId, delegates to ItemListDisplay.

export const ProbItemStackIcon: Component<{
    probStack: ProbabilisticItemStack;
    chances?: number;
    small?: boolean;
    noInteract?: boolean;
}> = (props) => {
    const inner = () => props.probStack.itemStack;

    // Check if the inner item is actually an item list
    const resolved = createMemo(() => {
        const s = inner();
        if (!s) return undefined;
        return resolveStack(s.itemId, s.itemType);
    });

    const itemList = createMemo(() => {
        const obj = resolved();
        if (!obj || !isItem(obj)) return undefined;
        const listId = (obj as ItemDesc).itemListId;
        if (!listId) return undefined;
        return BitCraftTables.ItemListDesc.indexedBy("id")?.()?.get(listId);
    });

    return (
        <Show when={inner()}>
            {(stack) => (
                <Show when={itemList()} fallback={
                    // Normal probabilistic item
                    <div class="flex flex-col items-center gap-0.5">
                        <ProbBadge probability={props.probStack.probability} chances={props.chances}/>
                        <ItemStackIcon
                            class="pt-1" // lines it up with ItemListPossibility borders
                            stack={stack()}
                            small={props.small ?? true}
                            noInteract={props.noInteract}
                        />
                    </div>
                }>
                    {(list) => (
                        // Item list with probability wrapper
                        <ItemListDisplay
                            itemList={list()}
                            probability={props.probStack.probability}
                            chances={props.chances}
                            originalIcon={() => <ItemStackIcon stack={stack()} noInteract hideSingle/>}
                            small={props.small}
                            noInteract={props.noInteract}
                        />
                    )}
                </Show>
            )}
        </Show>
    );
};

// ─── Item List Average Calculation ─────────────────────────────

interface AveragedStack {
    itemId: number;
    itemType: ItemType;
    avgQty: number;
}

function computeAverages(possibilities: ItemListPossibility[]): AveragedStack[] {
    const totals = new Map<string, { weighted: number; itemId: number; itemType: ItemType }>();
    let totalWeight = 0;
    for (const poss of possibilities) {
        totalWeight += poss.probability;
        for (const stack of poss.items) {
            const key = `${stack.itemType.tag}_${stack.itemId}`;
            const existing = totals.get(key);
            if (existing) {
                existing.weighted += stack.quantity * poss.probability;
            } else {
                totals.set(key, {
                    weighted: stack.quantity * poss.probability,
                    itemId: stack.itemId,
                    itemType: stack.itemType,
                });
            }
        }
    }
    if (totalWeight === 0) return [];
    return Array.from(totals.values()).map(t => ({
        itemId: t.itemId,
        itemType: t.itemType,
        avgQty: t.weighted / totalWeight,
    }));
}

/**
 * Recursively compute averages, expanding any inner item lists into their constituent items.
 * multiplier represents the cumulative probability weight from outer context (starts at 1).
 * Returns avgQty values representing expected quantity per selection of the outermost list.
 */
function computeAveragesFlatExpanded(possibilities: ItemListPossibility[], multiplier: number = 1): AveragedStack[] {
    const totals = new Map<string, { weighted: number; itemId: number; itemType: ItemType }>();
    const totalWeight = possibilities.reduce((sum, p) => sum + p.probability, 0);
    if (totalWeight === 0) return [];

    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")?.();
    const listIndex = BitCraftTables.ItemListDesc.indexedBy("id")?.();

    for (const poss of possibilities) {
        const selectProb = (poss.probability / totalWeight) * multiplier;
        for (const stack of poss.items) {
            // Check if this stack resolves to an inner item list
            let handledAsInnerList = false;
            if (stack.itemType.tag === ItemType.Item.tag) {
                const item = itemIndex?.get(stack.itemId);
                if (item?.itemListId) {
                    const innerList = listIndex?.get(item.itemListId);
                    if (innerList) {
                        // Recurse: multiply probability by select chance × stack quantity
                        const innerAvgs = computeAveragesFlatExpanded(innerList.possibilities, selectProb * stack.quantity);
                        for (const ia of innerAvgs) {
                            const key = `${ia.itemType.tag}_${ia.itemId}`;
                            const existing = totals.get(key);
                            if (existing) existing.weighted += ia.avgQty;
                            else totals.set(key, { weighted: ia.avgQty, itemId: ia.itemId, itemType: ia.itemType });
                        }
                        handledAsInnerList = true;
                    }
                }
            }
            if (!handledAsInnerList) {
                const key = `${stack.itemType.tag}_${stack.itemId}`;
                const contribution = stack.quantity * selectProb;
                const existing = totals.get(key);
                if (existing) existing.weighted += contribution;
                else totals.set(key, { weighted: contribution, itemId: stack.itemId, itemType: stack.itemType });
            }
        }
    }

    return Array.from(totals.values()).map(t => ({
        itemId: t.itemId,
        itemType: t.itemType,
        avgQty: t.weighted,
    }));
}

// ─── ItemListDisplay ───────────────────────────────────────────
// Renders weighted-average items inline, with a popover showing the full list.

export const ItemListDisplay: Component<{
    itemList: ItemListDesc;
    /** Outer probability (from ProbabilisticItemStack wrapping this list) */
    probability?: number;
    chances?: number;
    /** The original ItemStack that resolved to this list (shown in popover) */
    originalIcon?: () => JSX.Element;
    small?: boolean;
    noInteract?: boolean;
}> = (props) => {
    const { displayProbabilityAsAverage, flattenItemListOutputs } = useSettings();
    const sorted = createMemo(() =>
        [...props.itemList.possibilities].sort((a, b) => b.probability - a.probability)
    );

    /** True if any possibility contains an item that resolves to an inner item list */
    const hasInnerLists = createMemo(() => {
        const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")?.();
        const listIndex = BitCraftTables.ItemListDesc.indexedBy("id")?.();
        return sorted().some(poss =>
            poss.items.some(stack => {
                if (stack.itemType.tag !== ItemType.Item.tag) return false;
                const item = itemIndex?.get(stack.itemId);
                if (!item?.itemListId) return false;
                return !!listIndex?.get(item.itemListId);
            })
        );
    });

    // Pre-compute both branches independently — each only recomputes when sorted() changes.
    // Toggling flattenItemListOutputs just switches between the two cached results.
    const normalAverages = createMemo(() => computeAverages(sorted()));
    const flatAverages = createMemo(() => computeAveragesFlatExpanded(sorted()));
    const averages = createMemo(() => flattenItemListOutputs() && hasInnerLists() ? flatAverages() : normalAverages());

    return (
        <Popover flip={true} slide={true} overlap={true} fitViewport={true}>
            <div class="flex flex-col items-center gap-0.5">
                {/* Outer probability badge */}
                <Show when={props.probability != null}>
                    <ProbBadge probability={props.probability!} chances={props.chances}/>
                </Show>
                <PopoverTrigger class="cursor-pointer">
                    {/* Averaged items in a styled group */}
                    <div class={cn(
                        "flex flex-row flex-wrap justify-center items-end gap-0.5 rounded-md px-1 py-0.5",
                        "bg-muted/40 border border-dashed border-muted-foreground/30",
                    )}>
                        <For each={averages()}>
                            {(avg) => (
                                <ItemStackIcon
                                    stack={{itemId: avg.itemId, itemType: avg.itemType, quantity: avg.avgQty} as ItemStack}
                                    displayQty={displayProbabilityAsAverage() && props.chances && props.probability ? fixFloat(props.chances * avg.avgQty * props.probability) : undefined}
                                    small={props.small ?? true}
                                    noInteract
                                />
                            )}
                        </For>
                    </div>
                    <span class="text-[10px] text-muted-foreground italic">
                        <Show when={flattenItemListOutputs() && hasInnerLists()} fallback={
                            <Show when={sorted().length > 1} fallback={"exact"}>avg</Show>
                        }>expanded</Show>
                    </span>
                </PopoverTrigger>
            </div>
            <PopoverContent class="min-w-80 max-w-[90svw] max-h-[60vh] overflow-y-auto" onOpenAutoFocus={e => e.preventDefault()}>
                <ItemListPopover
                    itemList={props.itemList}
                    possibilities={sorted()}
                    originalIcon={props.originalIcon}
                    hasInnerLists={hasInnerLists()}
                />
            </PopoverContent>
        </Popover>
    );
};

// ─── Item List Popover Content ─────────────────────────────────

const ItemListPopover: Component<{
    itemList: ItemListDesc
    possibilities: ItemListPossibility[];
    originalIcon?: () => JSX.Element;
    hasInnerLists: boolean;
}> = (props) => {
    const { flattenItemListOutputs, setFlattenItemListOutputs } = useSettings();
    const totalWeight = createMemo(() =>
        props.possibilities.reduce((sum, p) => sum + p.probability, 0)
    );

    return (
        <div class="flex flex-col gap-2">
            <A class="font-medium text-sm text-center" href={`/database/item-list/${props.itemList.id}`}>
                {props.itemList.name}
            </A>

            {/* Show original item that resolves to this list */}
            <Show when={props.originalIcon}>
                <div class="flex justify-center py-1 border-b border-muted">
                    {props.originalIcon!()}
                </div>
            </Show>

            {/* Expand inner lists toggle */}
            <Show when={props.hasInnerLists}>
                <Button
                    onClick={() => setFlattenItemListOutputs(!flattenItemListOutputs())}
                    variant="outline"
                >
                    {flattenItemListOutputs() ? "Collapse Inner Lists" : "Expand Inner Lists"}
                </Button>
            </Show>

            {/* Weighted table */}
            <table class="w-full text-sm">
                <thead>
                <tr class="text-muted-foreground text-xs border-b">
                    <th class="text-right pr-3 py-1 font-medium">Weight</th>
                    <th class="text-right pr-3 py-1 font-medium">%</th>
                    <th class="text-left py-1 font-medium">Items</th>
                </tr>
                </thead>
                <tbody>
                <For each={props.possibilities}>
                    {(poss) => (
                        <tr class="border-b border-muted/50 last:border-none">
                            <td class="text-right pr-3 py-1.5 tabular-nums text-muted-foreground">
                                {fixFloat(poss.probability, 5)}
                            </td>
                            <td class="text-right pr-3 py-1.5 tabular-nums">
                                {fixFloat((poss.probability / totalWeight()) * 100, 5)}%
                            </td>
                            <td class="py-1.5">
                                <div class="flex flex-row flex-wrap gap-1">
                                    <For each={poss.items} fallback={
                                        <span class={"text-xs text-muted-foreground"}>Nothing</span>
                                    }>
                                        {(stack) => (
                                            <ItemStackIcon stack={stack} small/>
                                        )}
                                    </For>
                                </div>
                            </td>
                        </tr>
                    )}
                </For>
                </tbody>
            </table>
        </div>
    );
};

// ─── ItemStackArray ────────────────────────────────────────────
// Renders a horizontal row of stacks.

export const ItemStackArray: Component<{
    stacks: ItemStack[];
    small?: boolean;
    showName?: boolean;
    class?: string;
}> = (props) => (
    <div class={cn("flex flex-row flex-wrap items-end justify-center gap-0.5", props.class)}>
        <For each={props.stacks}>
            {(stack) => (
                <ItemStackIcon stack={stack} small={props.small ?? true} showName={props.showName}/>
            )}
        </For>
    </div>
);

// ─── InputItemStackArray ───────────────────────────────────────

export const InputItemStackArray: Component<{
    stacks: InputItemStack[];
    small?: boolean;
    class?: string;
}> = (props) => (
    <div class={cn("flex flex-row flex-wrap items-end justify-center gap-0.5", props.class)}>
        <For each={props.stacks}>
            {(stack) => (
                <ItemStackIcon stack={stack} small={props.small ?? true}/>
            )}
        </For>
    </div>
);

// ─── QuestDropDisplay ──────────────────────────────────────────
// Renders a quest-conditional drop: warning-colored group + popover with quest/stage info.

export const QuestDropDisplay: Component<{
    questDrop: QuestDropDesc;
    /** HP / progress points of source (for avg calc tooltip) */
    chances?: number;
    class?: string;
}> = (props) => {
    const questStage = () => props.questDrop.requiredStageId
        ? BitCraftTables.QuestStageDesc.indexedBy("id")()?.get(props.questDrop.requiredStageId)
        : undefined;

    return (
        <Show when={props.questDrop.itemDrop?.itemStack}>
            <Popover flip={true} slide={true} overlap={true} fitViewport={true}>
                <div class={cn("flex flex-col items-center gap-0.5", props.class)}>
                    <ProbBadge probability={props.questDrop.itemDrop.probability} chances={props.chances}/>
                    <PopoverTrigger class="cursor-pointer">
                        {/* Warning-colored group box — matches ItemListDisplay styling but in amber */}
                        <div class={cn(
                            "flex flex-row flex-wrap sm:flex-nowrap items-end gap-0.5 rounded-md px-1 py-0.5",
                            "bg-warning/50 dark:bg-warning/25 border border-dashed border-warning-foreground",
                        )}>
                            <ItemStackIcon stack={props.questDrop.itemDrop.itemStack!}/>
                        </div>
                        <span class="text-[10px] text-muted-foreground italic">quest</span>
                    </PopoverTrigger>
                </div>
                <PopoverContent class="w-auto min-w-56" onOpenAutoFocus={e => e.preventDefault()}>
                    <div class="flex flex-col gap-1.5 p-1">
                        <span class="text-xs text-muted-foreground font-medium">Quest Conditional Drop</span>
                        <QuestChainLinkById id={props.questDrop.requiredQuestId}/>
                        <Show when={questStage()} fallback={
                            <span class="text-sm text-muted-foreground">
                                Stage #{props.questDrop.requiredStageId}
                            </span>
                        }>
                            {s => <span class="text-sm">{s().name}</span>}
                        </Show>
                    </div>
                </PopoverContent>
            </Popover>
        </Show>
    );
};

// ─── expandStack ───────────────────────────────────────────────
// Smart dispatcher that resolves the right component for any stack-like input.
// Handles: ItemStack, ProbabilisticItemStack, ItemListDesc
// For ProbabilisticItemStack: detects if inner item is an item list and renders appropriately

export function expandStack(
    input: ItemStack | ProbabilisticItemStack | ItemListDesc,
    chances?: number
): JSX.Element {
    // ProbabilisticItemStack
    if ("probability" in input && "itemStack" in input) {
        const probStack = input as ProbabilisticItemStack;
        if (!probStack.itemStack) return <></>;
        return <ProbItemStackIcon probStack={probStack} chances={chances}/>;
    }

    // ItemListDesc
    if ("possibilities" in input) {
        return <ItemListDisplay itemList={input as ItemListDesc} chances={chances}/>;
    }

    // Plain ItemStack — check if it resolves to an item list
    const stack = input as ItemStack;
    if (stack.itemType.tag === ItemType.Item.tag) {
        const item = BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(stack.itemId);
        if (item?.itemListId) {
            const list = BitCraftTables.ItemListDesc.indexedBy("id")?.()?.get(item.itemListId);
            if (list) {
                return <ItemListDisplay itemList={list} chances={input.quantity} originalIcon={() => <ItemStackIcon stack={stack} hideSingle/>}/>;
            }
        }
    }

    return <ItemStackIcon stack={stack}/>;
}
