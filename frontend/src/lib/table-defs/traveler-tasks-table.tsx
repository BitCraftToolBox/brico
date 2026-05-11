import {CellContext} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {SkillLinkById} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareBasic} from "~/lib/utils";


function renderItemStackArray(props: CellContext<TravelerTaskDesc, any>) {
    const stacks = props.getValue() as ItemStack[];
    return <Show when={stacks.length}>
        <ItemStackArray stacks={stacks}/>
    </Show>
}

export const TravelerTaskDefs: BitCraftToDataDef<TravelerTaskDesc> = {
    columns: [
        headerColumn({
            title: "Description",
            accessor: {accessorKey: "description"},
            route: tt => ["traveler-task", tt.id],
            customRender: (val) => <span class="text-sm text-balance">{val}</span>,
        }),
        {
            id: "Requirements",
            accessorKey: "requiredItems",
            cell: renderItemStackArray,
        },
        {
            id: "Rewards",
            accessorKey: "rewardedItems",
            cell: renderItemStackArray,
            sortingFn: (rowA, rowB) => {
                const a = rowA.original.rewardedItems;
                const b = rowB.original.rewardedItems;
                const aNum = a.reduce((s: number, r: ItemStack) => s + r.quantity, 0);
                const bNum = b.reduce((s: number, r: ItemStack) => s + r.quantity, 0);
                return compareBasic(aNum, bNum);
            }
        },
        {
            id: "Skill",
            accessorFn: task => {
                const skillIndex = BitCraftTables.SkillDesc.indexedBy("id")!()!;
                if (!task.levelRequirement.skillId) return "";
                const skillData = skillIndex.get(task.levelRequirement.skillId);
                return skillData ? skillData.name : "Unknown";
            },
            cell: (props) => {
                const task = props.row.original;
                if (!task.levelRequirement.skillId) return <></>;
                return <SkillLinkById skillId={task.levelRequirement.skillId}/>;
            },
        },
        {
            id: "Exp",
            accessorKey: "rewardedExperience.quantity",
            filterFn: 'inNumberRange'
        },
        {
            id: "Min Level",
            accessorKey: "levelRequirement.minLevel",
            filterFn: 'inNumberRange'
        },
        {
            id: "Max Level",
            accessorKey: "levelRequirement.maxLevel",
            filterFn: 'inNumberRange'
        },
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Skill"),
        rangeFilter("Exp"),
        rangeFilter("Min Level"),
        rangeFilter("Max Level"),
    ],
    searchColumns: ["Description"],
}