import {CompletionCondition} from "~/bindings/src/completion_condition_type";
import {ItemStackCompletionCondition} from "~/bindings/src/item_stack_completion_condition_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {LevelRequirement} from "~/bindings/src/level_requirement_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {QuestRequirement} from "~/bindings/src/quest_requirement_type";
import {QuestReward} from "~/bindings/src/quest_reward_type";
import {AchievementLink, CollectibleLinkById, ItemStackLink, KnowledgeLinkById, LinkedList, QuestChainLinkById, SkillLinkById,} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolColumn, boolFilter, headerColumn, rangeFilter, rowActions} from "~/lib/table-utils/column-builders";
import {fixFloat} from "~/lib/utils";

/** Union of all quest requirement/reward/condition entry types. */
export type QuestEntry = QuestRequirement | QuestReward | CompletionCondition;

/** Human-readable label for a requirement/reward/condition tag. */
export function reqOrRewardTagLabel(tag: string): string {
    switch (tag) {
        case "QuestChain":        return "Quest Chain";
        case "Achievement":       return "Achievement";
        case "Collectible":       return "Collectible";
        case "Level":             return "Level";
        case "ItemStack":         return "Item";
        case "SecondaryKnowledge":return "Knowledge";
        case "Experience":        return "Experience";
        case "EquippedItem":      return "Equipped Item";
        default:                  return tag;
    }
}

/**
 * Plain-text name for a single requirement, reward, or condition entry.
 * Must be called inside a reactive context (reads SpacetimeDB stores).
 */
export function reqOrRewardName(r: QuestEntry): string {
    switch (r.tag) {
        case "QuestChain":
            return BitCraftTables.QuestChainDesc.indexedBy("id")()?.get(r.value as number)?.name ?? `Quest #${r.value}`;
        case "Achievement":
            return BitCraftTables.AchievementDesc.indexedBy("id")()?.get(r.value as number)?.name ?? `Achievement #${r.value}`;
        case "Collectible":
            return BitCraftTables.CollectibleDesc.indexedBy("id")()?.get(r.value as number)?.name ?? `Collectible #${r.value}`;
        case "Level": {
            const lr = r.value as LevelRequirement;
            return `${BitCraftTables.SkillDesc.indexedBy("id")()?.get(lr.skillId)?.name ?? "Skill"} Lv. ${lr.level}`;
        }
        case "Experience": {
            const e = r.value as { skillId: number; quantity: number };
            return `${BitCraftTables.SkillDesc.indexedBy("id")()?.get(e.skillId)?.name ?? "Skill"}: ${fixFloat(e.quantity)}`;
        }
        case "ItemStack": {
            // CompletionCondition.ItemStack wraps ItemStackCompletionCondition; QuestRequirement/QuestReward wraps ItemStack directly
            const raw = r.value;
            const stack: ItemStack = "itemStack" in raw ? (raw as ItemStackCompletionCondition).itemStack : raw as ItemStack;
            if (stack.itemType.tag === ItemType.Cargo.tag) {
                return BitCraftTables.CargoDesc.indexedBy("id")()?.get(stack.itemId)?.name ?? `Cargo #${stack.itemId}`;
            }
            return BitCraftTables.ItemDesc.indexedBy("id")()?.get(stack.itemId)?.name ?? `Item #${stack.itemId}`;
        }
        case "EquippedItem": {
            const id = r.value as number;
            return BitCraftTables.ItemDesc.indexedBy("id")()?.get(id)?.name ?? `Item #${id}`;
        }
        case "SecondaryKnowledge":
            return BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")()?.get(r.value as number)?.name ?? `Knowledge #${r.value}`;
        default:
            return "";
    }
}

/** Render a single requirement, reward, or condition entry as a game link. */
export function ReqOrRewardLink(props: { qr: QuestEntry }) {
    switch (props.qr.tag) {
        case "QuestChain":
            return <QuestChainLinkById id={props.qr.value as number}/>;
        case "Achievement": {
            const id = props.qr.value as number;
            const ach = () => BitCraftTables.AchievementDesc.indexedBy("id")()?.get(id);
            return <AchievementLink id={id} name={ach()?.name}/>;
        }
        case "Collectible":
            return <CollectibleLinkById id={props.qr.value as number}/>;
        case "Level": {
            const lr = props.qr.value as LevelRequirement;
            return (
                <span class="inline-flex items-center gap-1">
                    <SkillLinkById skillId={lr.skillId}/> <span class="text-muted-foreground">Lv. {lr.level}</span>
                </span>
            );
        }
        case "Experience": {
            const expStack = props.qr.value as { skillId: number; quantity: number };
            return (
                <span class="inline-flex items-center gap-1">
                    <SkillLinkById skillId={expStack.skillId}/><span class="text-muted-foreground">XP: {fixFloat(expStack.quantity)}</span>
                </span>
            );
        }
        case "ItemStack": {
            const raw = props.qr.value;
            const stack: ItemStack = "itemStack" in raw ? (raw as ItemStackCompletionCondition).itemStack : raw as ItemStack;
            return <ItemStackLink stack={stack}/>;
        }
        case "EquippedItem": {
            const id = props.qr.value as number;
            const stack = { itemId: id, itemType: ItemType.Item, quantity: 1 } as ItemStack;
            return <ItemStackLink stack={stack}/>;
        }
        case "SecondaryKnowledge":
            return <KnowledgeLinkById id={props.qr.value as number}/>;
        default:
            return <></>;
    }
}

/** Shared column builder for requirements or rewards arrays. */
function reqOrRewardColumn(
    id: string,
    getEntries: (row: QuestChainDesc) => (QuestRequirement | QuestReward)[],
) {
    return {
        id,
        accessorFn: (row: QuestChainDesc) =>
            getEntries(row)
                .filter(r => r.tag !== "PaddingNone")
                .map(r => reqOrRewardName(r))
                .join(", "),
        cell: (props: any) => {
            const entries = getEntries(props.row.original).filter((r: any) => r.tag !== "PaddingNone");
            if (!entries.length) return <></>;
            return (
                <LinkedList>
                    {entries.map((r: any) => <ReqOrRewardLink qr={r}/>)}
                </LinkedList>
            );
        },
    };
}

export const QuestChainDefs: BitCraftToDataDef<QuestChainDesc> = {
    columns: [
        headerColumn<QuestChainDesc, any>({
            route: q => ["quest-chain", q.id],
        }),
        {
            id: "Stages",
            accessorFn: row => row.stages?.length ?? 0,
            filterFn: "inNumberRange",
        },
        reqOrRewardColumn("Requirements", row => row.requirements ?? []),
        reqOrRewardColumn("Rewards", row => [...(row.rewards ?? []), ...(row.implicitRewards ?? [])]),
        boolColumn<QuestChainDesc, boolean>("Is Hint", {accessorKey: "isHint"}),
        boolColumn<QuestChainDesc, boolean>("Unstartable", {accessorKey: "unstartable"}),
        boolColumn<QuestChainDesc, boolean>("Is Secret", {accessorKey: "isSecret"}),
        rowActions(),
    ],
    facetedFilters: [
        rangeFilter("Stages"),
        boolFilter("Is Hint"),
        boolFilter("Unstartable"),
        boolFilter("Is Secret"),
    ],
    searchColumns: ["Name", "Requirements", "Rewards"],
};
