import {Rarity} from "~/bindings/src/rarity_type";
import {ToolDesc} from "~/bindings/src/tool_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const ToolDefs: BitCraftToDataDef<ToolDesc> = {
    columns: [
        headerColumn<ToolDesc, any>({
            title: "Name",
            accessor: {accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(tool.itemId)?.name ?? `Item #${tool.itemId}`},
            route: tool => ["tool", tool.itemId],
            prefixElement: tool => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(tool.itemId);
                return item ? <ItemIcon item={item} small noInteract={true}/> : <></>;
            },
        }),
        {
            id: "Tool Type",
            accessorFn: row => BitCraftTables.ToolTypeDesc.indexedBy("id")?.()?.get(row.toolType)?.name ?? `#${row.toolType}`,
            filterFn: includedIn<ToolDesc>(),
        },
        {id: "Power", accessorKey: "power", filterFn: "inNumberRange"},
        {id: "Level", accessorKey: "level", filterFn: "inNumberRange"},
        tierColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")?.().get(tool.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")?.().get(tool.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Tool Type"),
        rangeFilter("Power"),
        rangeFilter("Level"),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"],
};
