import {ItemStack, TravelerTaskDesc} from "~/bindings/src";
import {BitCraftToDataDef, rowActionRawOnly} from "~/lib/table-defs/base";
import {CellContext, Column} from "@tanstack/solid-table";
import {BitCraftTables} from "~/lib/spacetime";
import {Show} from "solid-js";
import {ItemStackArrayComponent} from "~/components/bitcraft/items";
import {compareBasic} from "~/lib/utils";


function renderItemStackArray(props: CellContext<TravelerTaskDesc, any>) {
    const stacks = props.getValue() as ItemStack[];
    return <Show when={stacks.length}>
        <ItemStackArrayComponent
            stacks={() => stacks}
        />
    </Show>
}

export const TravelerTaskDefs: BitCraftToDataDef<TravelerTaskDesc> = {
    columns: [
        {
            id: "Skill",
            accessorFn: task => {
                const skillIndex = BitCraftTables.SkillDesc.indexedBy("id")!()!;
                const skillData = skillIndex.get(task.levelRequirement.skillId);
                return skillData ? skillData.name : "Unknown";
            }
        },
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
        {
            id: "Description",
            accessorKey: "description"
        },
        rowActionRawOnly
    ],
    facetedFilters: [
        {
            column: "Skill",
            title: "Skill",
            options: (col: Column<TravelerTaskDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray()
            }
        },
        {
            column: "Min Level",
            title: "Min Level",
            options: (col: Column<TravelerTaskDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Min Level",
                    minMax: minMax || [0, 0]
                }
            }
        },
        {
            column: "Max Level",
            title: "Max Level",
            options: (col: Column<TravelerTaskDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Max Level",
                    minMax: minMax || [0, 0]
                }
            }
        },
    ]
}