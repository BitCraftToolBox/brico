import {msg} from "@lingui/core/macro";
import {CellContext} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {sourceRow} from "~/lib/data-translation";
import {SkillLinkById} from "~/lib/game-links";
import {gameText} from "~/lib/labels";
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
            label: gameText(msg`Description`),
            accessor: {accessorKey: "description"},
            route: tt => ["traveler-task", tt.id],
            customRender: (val) => <span class="text-sm text-balance">{val}</span>,
        }),
        {
            id: "Requirements",
            meta: {label: gameText(msg`Requires`, "Requires ")},
            accessorKey: "requiredItems",
            cell: renderItemStackArray,
        },
        {
            id: "Rewards",
            meta: {label: gameText(msg`Rewards`)},
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
            meta: {label: gameText(msg`Skill`)},
            accessorFn: task => {
                // English value — filterable, so it ends up in shared URLs. The cell renders
                // SkillLinkById, which localizes for display. See table-utils/column-builders.tsx.
                const skillIndex = BitCraftTables.SkillDesc.indexedBy("id")();
                if (!task.levelRequirement.skillId) return "";
                const skillData = sourceRow(skillIndex.get(task.levelRequirement.skillId));
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
            meta: {label: gameText(msg`EXP`)},
            accessorKey: "rewardedExperience.quantity",
            filterFn: 'inNumberRange'
        },
        {
            id: "Min Level",
            meta: {label: msg`Min Level`},
            accessorKey: "levelRequirement.minLevel",
            filterFn: 'inNumberRange'
        },
        {
            id: "Max Level",
            meta: {label: msg`Max Level`},
            accessorKey: "levelRequirement.maxLevel",
            filterFn: 'inNumberRange'
        },
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Skill", gameText(msg`Skill`)),
        rangeFilter("Exp", gameText(msg`EXP`)),
        rangeFilter("Min Level", msg`Min Level`),
        rangeFilter("Max Level", msg`Max Level`),
    ],
    searchColumns: ["Description"],
}