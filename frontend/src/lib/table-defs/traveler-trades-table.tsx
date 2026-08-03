import {msg} from "@lingui/core/macro";
import {CellContext} from "@tanstack/solid-table";
import {Show} from "solid-js";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {SkillLinkById} from "~/lib/game-links";
import {gameText} from "~/lib/labels";
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
            label: gameText(msg`Description`),
            accessor: {accessorFn: trade => getTravelerTradeName(trade)},
            route: trade => ["traveler-trade", trade.id],
            customRender: (val) => <span class="text-sm text-balance">{val}</span>,
        }),
        {
            id: "Traveler",
            meta: {label: gameText(msg`Traveler`)},
            // The NPC's English name — filterable, so it ends up in shared URLs. See the note at
            // the top of table-utils/column-builders.tsx.
            accessorFn: (trade) => getTravelerNpcName(trade.traveler.tag, {source: true}),
            cell: props => translateGameText(props.getValue() as string ?? ""),
            filterFn: includedIn<TravelerTradeOrderDesc>(),
        },
        {
            id: "Required Items",
            meta: {label: msg`Required Items`},
            accessorKey: "requiredItems",
            cell: renderItemStackArray,
        },
        {
            id: "Offer Items",
            meta: {label: msg`Offer Items`},
            accessorKey: "offerItems",
            cell: renderItemStackArray,
        },
        {
            id: "Skill",
            meta: {label: gameText(msg`Skill`)},
            accessorFn: (trade) => {
                const req = trade.levelRequirements[0];
                if (!req?.skillId) return undefined;
                // English value; the cell renders SkillLinkById, which localizes for display.
                return sourceRow(BitCraftTables.SkillDesc.indexedBy("id")().get(req.skillId))?.name ?? `#${req.skillId}`;
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
            meta: {label: gameText(msg`Level`)},
            accessorFn: (trade) => trade.levelRequirements[0]?.level,
            filterFn: "inNumberRange",
        },
        knowledgeColumn<TravelerTradeOrderDesc, number[]>(undefined, { accessorKey: "requiredKnowledges" }),
        knowledgeColumn<TravelerTradeOrderDesc, number[]>("Blocking Knowledge", { accessorKey: "blockingKnowledges" }, msg`Blocking Knowledge`),
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Traveler", gameText(msg`Traveler`), compareOptions),
        uniqueValuesFilter("Skill", gameText(msg`Skill`), compareOptions),
        rangeFilter("Level", gameText(msg`Level`)),
        uniqueValuesFilter("Required Knowledge", msg`Required Knowledge`, compareOptions),
        uniqueValuesFilter("Blocking Knowledge", msg`Blocking Knowledge`, compareOptions),
    ],
    searchColumns: ["Description"],
};
