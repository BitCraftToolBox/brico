import {Accessor, createMemo} from "solid-js";
import {CompletionCondition} from "~/bindings/src/completion_condition_type";
import {ItemStackCompletionCondition} from "~/bindings/src/item_stack_completion_condition_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {QuestRequirement} from "~/bindings/src/quest_requirement_type";
import {QuestReward} from "~/bindings/src/quest_reward_type";
import {QuestStageDesc} from "~/bindings/src/quest_stage_desc_type";
import {BitCraftTables} from "~/lib/spacetime";

// ─── Quest Completion Helpers ───────────────────────────────────

export function questChainCompleter(completedQuests: Accessor<Set<number>>, setCompletedQuests: (ids: number[]) => void) {
    const current = createMemo(() => completedQuests());
    const qi = BitCraftTables.QuestChainDesc.indexedBy("id");

    function markComplete(id: number) {
        const c = current();
        if (!c.add(id)) return; // already complete
        const addPrereqs = (pid: number) => {
            const quest = qi().get(pid);
            if (!quest) return;
            for (const r of (quest.requirements ?? [])) {
                if (r.tag === "QuestChain" && c.add(r.value as number)) {
                    addPrereqs(r.value as number);
                }
            }
        };
        addPrereqs(id);
        setCompletedQuests([...c]);
    }
    function markIncomplete(id: number) {
        const c = current();
        if (!c.delete(id)) return; // already incomplete
        const allQuests = BitCraftTables.QuestChainDesc.get() ?? [];
        const dependents = new Set<number>();
        const findDependents = (pid: number) => {
            for (const quest of allQuests) {
                const reqs = quest.requirements ?? [];
                const hasPrereq = reqs.some(r => r.tag === "QuestChain" && r.value === pid);
                if (hasPrereq && !dependents.has(quest.id)) {
                    dependents.add(quest.id);
                    findDependents(quest.id);
                }
            }
        };
        findDependents(id);
        for (const d of dependents) c.delete(d);
        setCompletedQuests([...c]);
    }
    function toggleComplete(id: number) {
        if (current().has(id)) {
            markIncomplete(id);
        } else {
            markComplete(id);
        }
    }
    return { markComplete, markIncomplete, toggleComplete };
}


export const stagesByChain = () => createMemo(() => {
    const map = new Map<number, QuestStageDesc[]>();
    const stages = BitCraftTables.QuestStageDesc.get() ?? [];
    for (const s of stages) {
        const arr = map.get(s.chainDescId);
        if (arr) arr.push(s);
        else map.set(s.chainDescId, [s]);
    }
    return map;
});

// ─── Cumulative Tree Calculator ─────────────────────────────────

export interface QuestTreeResult {
    /** Incomplete ancestor quest IDs (the ones that still need doing) */
    involvedQuestIds: Set<number>;
    /** ALL ancestor quest IDs — complete and incomplete (used for dimming/bounding box) */
    allTreeQuestIds: Set<number>;
    /** Aggregated, sorted requirements from all incomplete quests */
    requirements: (QuestRequirement | CompletionCondition)[];
    /** Aggregated, sorted rewards from all incomplete quests */
    rewards: QuestReward[];
}

// Sort order for entry types in the panel display
const TAG_SORT_ORDER: Record<string, number> = {
    ItemStack: 0,
    EquippedItem: 1,
    Level: 2,
    Experience: 3,
    SecondaryKnowledge: 4,
    Achievement: 5,
    Collectible: 6,
};

type AnyEntry = QuestRequirement | CompletionCondition | QuestReward;

/**
 * Aggregate raw entries:
 *  - Level:      keep the highest level per skill ID
 *  - Experience: sum quantities per skill ID
 *  - ItemStack:  sum quantities per item
 *  - Others:     deduplicate by tag+value key
 * Then sort by TAG_SORT_ORDER.
 */
function aggregateEntries(raw: AnyEntry[]): AnyEntry[] {
    const levels = new Map<number, number>(); // skillId → maxLevel
    const xpTotals = new Map<number, number>(); // skillId → totalQty
    const itemTotals = new Map<string, { entry: AnyEntry; qty: number }>();
    const deduped = new Map<string, AnyEntry>();

    for (const e of raw) {
        if (e.tag === "PaddingNone") continue;
        switch (e.tag) {
            case "Level": {
                const lr = e.value as { skillId: number; level: number };
                if ((levels.get(lr.skillId) ?? 0) < lr.level) levels.set(lr.skillId, lr.level);
                break;
            }
            case "Experience": {
                const exp = e.value as { skillId: number; quantity: number };
                xpTotals.set(exp.skillId, (xpTotals.get(exp.skillId) ?? 0) + exp.quantity);
                break;
            }
            case "ItemStack": {
                const v = e.value;
                const stack: ItemStack = "itemStack" in (v as object)
                    ? (v as ItemStackCompletionCondition).itemStack
                    : v as ItemStack;
                const key = `${stack.itemType.tag}-${stack.itemId}`;
                const cur = itemTotals.get(key);
                if (cur) cur.qty += stack.quantity;
                else itemTotals.set(key, {entry: e, qty: stack.quantity});
                break;
            }
            default: {
                const key = `${e.tag}-${e.value}`;
                if (!deduped.has(key)) deduped.set(key, e);
            }
        }
    }

    const result: AnyEntry[] = [];
    for (const [skillId, maxLevel] of levels) {
        result.push({tag: "Level", value: {skillId, level: maxLevel}} as AnyEntry);
    }
    for (const [skillId, totalQty] of xpTotals) {
        result.push({tag: "Experience", value: {skillId, quantity: totalQty}} as AnyEntry);
    }
    for (const {entry, qty} of itemTotals.values()) {
        const v = entry.value;
        if ("itemStack" in (v as object)) {
            const cc = v as ItemStackCompletionCondition;
            result.push({tag: "ItemStack", value: {...cc, itemStack: {...cc.itemStack, quantity: qty}}} as AnyEntry);
        } else {
            result.push({tag: "ItemStack", value: {...(v as ItemStack), quantity: qty}} as AnyEntry);
        }
    }
    for (const e of deduped.values()) result.push(e);
    result.sort((a, b) => (TAG_SORT_ORDER[a.tag] ?? 50) - (TAG_SORT_ORDER[b.tag] ?? 50));
    return result;
}

/**
 * Resolve knowledge ID → knowledge scroll → crafting recipe items.
 * Returns item stacks from the first crafting recipe for the scroll, if any.
 */
function resolveKnowledgeCraftingItems(knowledgeId: number): ItemStack[] {
    const scrolls = BitCraftTables.KnowledgeScrollDesc.get() ?? [];
    const scroll = scrolls.find(s => s.secondaryKnowledgeId === knowledgeId);
    if (!scroll) return [];

    const recipes = BitCraftTables.CraftingRecipeDesc.get() ?? [];
    const recipe = recipes.find(r =>
        r.craftedItemStacks.some(s => s.itemId === scroll.itemId && s.itemType.tag === ItemType.Item.tag)
    );
    if (!recipe) return [];

    return recipe.consumedItemStacks.map(s => ({
        itemId: s.itemId,
        itemType: s.itemType,
        quantity: s.quantity,
    } as ItemStack));
}

/**
 * Compute the full cumulative quest tree for `targetId`: walk all QuestChain
 * prerequisites recursively and aggregate requirements + rewards from incomplete quests.
 */
export function computeQuestTree(
    targetId: number,
    completedQuests: Set<number>,
    questIndex: Map<number, QuestChainDesc>,
    stagesByChain: Map<number, QuestStageDesc[]>,
): QuestTreeResult {
    const involvedQuestIds = new Set<number>();
    const allTreeQuestIds  = new Set<number>();
    const rawReqs: (QuestRequirement | CompletionCondition)[] = [];
    const rawRewards: QuestReward[] = [];
    const stageKnowledgeIds = new Set<number>();

    const stack = [targetId];
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (allTreeQuestIds.has(id)) continue;
        allTreeQuestIds.add(id);

        const quest = questIndex.get(id);
        if (!quest) continue;

        if (!completedQuests.has(id)) {
            involvedQuestIds.add(id);

            for (const r of (quest.requirements ?? [])) {
                if (r.tag === "PaddingNone" || r.tag === "QuestChain") continue;
                rawReqs.push(r);
            }

            const stages = stagesByChain.get(id) ?? [];
            for (const stage of stages) {
                for (const cc of (stage.completionConditions ?? [])) {
                    if (cc.tag === "PaddingNone") continue;
                    rawReqs.push(cc);
                    if (cc.tag === "SecondaryKnowledge") stageKnowledgeIds.add(cc.value as number);
                }
            }

            for (const r of [...(quest.rewards ?? []), ...(quest.implicitRewards ?? [])]) {
                if (r.tag !== "PaddingNone") rawRewards.push(r);
            }
        }

        for (const r of (quest.requirements ?? [])) {
            if (r.tag === "QuestChain") stack.push(r.value as number);
        }
    }

    for (const kId of stageKnowledgeIds) {
        for (const item of resolveKnowledgeCraftingItems(kId)) {
            rawReqs.push({tag: "ItemStack", value: item} as QuestRequirement);
        }
    }

    return {
        involvedQuestIds,
        allTreeQuestIds,
        requirements: aggregateEntries(rawReqs) as (QuestRequirement | CompletionCondition)[],
        rewards:      aggregateEntries(rawRewards) as QuestReward[],
    };
}

/**
 * Lightweight variant: enumerate all ancestor quest IDs without aggregating
 * requirements/rewards. Use this for bounding-box calculations.
 */
export function getQuestTreeIds(
    targetId: number,
    questIndex: Map<number, QuestChainDesc>,
): Set<number> {
    const ids = new Set<number>();
    const stack = [targetId];
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        const quest = questIndex.get(id);
        if (!quest) continue;
        for (const r of (quest.requirements ?? [])) {
            if (r.tag === "QuestChain") stack.push(r.value as number);
        }
    }
    return ids;
}
