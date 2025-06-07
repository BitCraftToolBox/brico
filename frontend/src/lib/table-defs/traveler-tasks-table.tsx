import {ItemStack, TravelerTaskDesc} from "~/bindings/ts";
import {useDetailDialog} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {BitCraftToDataDef, rowActionRawOnly} from "~/lib/table-defs/base";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {CellContext, Column} from "@tanstack/solid-table";
import {BitCraftTables} from "~/lib/spacetime";
import {Show} from "solid-js";
import {ItemStackArrayComponent} from "~/components/bitcraft/items";
import {Rarities} from "~/lib/bitcraft-utils";
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
            accessorKey: "levelRequirement.skillId",
            cell: props => {
                const skillIndex = BitCraftTables.SkillDesc.indexedBy("id")!()!;
                const skillData = skillIndex.get(props.getValue());
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
            accessorKey: "rewardedExperience.quantity"
        },
        {
            id: "Min Level",
            accessorKey: "levelRequirement.minLevel"
        },
        {
            id: "Max Level",
            accessorKey: "levelRequirement.maxLevel"
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
                const skillIndex = BitCraftTables.SkillDesc.indexedBy("id")!()!;
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: skillIndex.get(v)?.name ?? "Unknown", value: v
                    }
                }).toArray()
            }
        },
    ]
}