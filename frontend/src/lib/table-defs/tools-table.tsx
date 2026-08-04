import {msg} from "@lingui/core/macro";
import {Rarity} from "~/bindings/src/rarity_type";
import {ToolDesc} from "~/bindings/src/tool_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {gameText} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const ToolDefs: BitCraftToDataDef<ToolDesc> = {
    columns: [
        headerColumn<ToolDesc, any>({
            title: "Name",
            accessor: {accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.name ?? `Item #${tool.itemId}`},
            // Row-click goes to the item page, not a dedicated tool page: it renders a
            // superset of these fields inline. See `DetailRoute` in table-utils/column-builders.
            route: tool => ["item", tool.itemId],
            prefixElement: tool => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId);
                return item ? <ItemIcon item={item} small noInteract={true}/> : <></>;
            },
        }),
        {
            id: "Tool Type",
            meta: {label: msg`Tool Type`},
            // English value — this column is filterable, so it ends up in shared URLs.
            // See the note at the top of table-utils/column-builders.tsx.
            accessorFn: row => sourceRow(BitCraftTables.ToolTypeDesc.indexedBy("id")().get(row.toolType))?.name ?? `#${row.toolType}`,
            // Wrapped in a JSX child so the translation stays reactive on a data-locale switch.
            cell: props => <>{translateGameText(props.getValue() as string ?? "")}</>,
            filterFn: includedIn<ToolDesc>(),
        },
        {id: "Power", meta: {label: gameText(msg`Power`)}, accessorKey: "power", filterFn: "inNumberRange"},
        {id: "Level", meta: {label: gameText(msg`Level`)}, accessorKey: "level", filterFn: "inNumberRange"},
        tierColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Tool Type", msg`Tool Type`),
        rangeFilter("Power", gameText(msg`Power`)),
        rangeFilter("Level", gameText(msg`Level`)),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"],
};
