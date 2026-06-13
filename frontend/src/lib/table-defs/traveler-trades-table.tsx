import {CellContext} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {SkillLinkById} from "~/lib/game-links";
import {getTravelerNpcName, getTravelerTradeName} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, knowledgeColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareOptions, includedIn} from "~/lib/utils";

function renderItemStackArray(props: CellContext<TravelerTradeOrderDesc, any>) {
    const stacks = props.getValue() as ItemStack[];
    return (
        <Show when={stacks.length}>
            <ItemStackArray stacks={stacks}/>
        </Show>
    );
}

export const TravelerTradeDefs: BitCraftToDataDef<TravelerTradeOrderDesc> = {
    columns: [
        headerColumn<TravelerTradeOrderDesc, string>({
            title: "Description",
            accessor: {accessorFn: trade => getTravelerTradeName(trade)},
            route: trade => ["traveler-trade", trade.id],
            customRender: (val) => <span class="text-sm text-balance">{val}</span>,
        }),
        {
            id: "Traveler",
            accessorFn: (trade) => getTravelerNpcName(trade.traveler.tag),
            filterFn: includedIn<TravelerTradeOrderDesc>(),
        },
        {
            id: "Required Items",
            accessorKey: "requiredItems",
            cell: renderItemStackArray,
        },
        {
            id: "Offer Items",
            accessorKey: "offerItems",
            cell: renderItemStackArray,
        },
        {
            id: "Skill",
            accessorFn: (trade) => {
                const req = trade.levelRequirements[0];
                if (!req?.skillId) return undefined;
                return BitCraftTables.SkillDesc.indexedBy("id")()?.get(req.skillId)?.name ?? `#${req.skillId}`;
            },
            cell: (props) => {
                const req = props.row.original.levelRequirements[0];
                if (!req?.skillId) return <></>;
                return <SkillLinkById skillId={req.skillId}/>;
            },
            filterFn: includedIn<TravelerTradeOrderDesc>(),
        },
        {
            id: "Level",
            accessorFn: (trade) => trade.levelRequirements[0]?.level,
            filterFn: "inNumberRange",
        },
        knowledgeColumn<TravelerTradeOrderDesc, number[]>(undefined, { accessorKey: "requiredKnowledges" }),
        knowledgeColumn<TravelerTradeOrderDesc, number[]>("Blocking Knowledge", { accessorKey: "blockingKnowledges" }),
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Traveler", undefined, compareOptions),
        uniqueValuesFilter("Skill", undefined, compareOptions),
        rangeFilter("Level"),
        uniqueValuesFilter("Required Knowledge", undefined, compareOptions),
        uniqueValuesFilter("Blocking Knowledge", undefined, compareOptions),
    ],
    searchColumns: ["Description"],
};
