import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    boolFilter,
    descriptionColumn,
    headerColumn,
    rangeFilter,
    rarityColumn,
    rarityFilter,
    rowActions,
    tagColumn,
    tagFilter,
    tierColumn,
    tierFilter,
} from "~/lib/table-utils/column-builders";
import {consolidateStats, statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";


/**
 * Consolidate all CsvStatEntry-based stats for an item from equipment, food buffs,
 * and knowledge stat modifiers.
 */
function getConsolidatedItemStats(item: ItemDesc): CsvStatEntry[] | undefined {
    const allStats: CsvStatEntry[] = [];

    // Equipment stats
    const equip = BitCraftTables.EquipmentDesc.indexedBy("itemId")?.()?.get(item.id);
    if (equip?.stats?.length) {
        allStats.push(...equip.stats);
    }

    // Food buff stats
    const food = BitCraftTables.FoodDesc.indexedBy("itemId")?.()?.get(item.id);
    if (food?.buffs?.length) {
        const buffIdx = BitCraftTables.BuffDesc.indexedBy("id");
        food.buffs.forEach(b => {
            const buff = buffIdx?.()?.get(b.buffId);
            if (buff?.stats?.length) allStats.push(...buff.stats);
        });
    }

    // Knowledge stat modifiers (via scroll -> secondary knowledge)
    const scroll = BitCraftTables.KnowledgeScrollDesc.indexedBy("itemId")?.()?.get(item.id);
    if (scroll) {
        const mod = BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")?.()?.get(scroll.secondaryKnowledgeId);
        if (mod?.stats?.length) allStats.push(...mod.stats);
    }

    return allStats.length ? consolidateStats(allStats) : undefined;
}

export const ItemDescDefs: BitCraftToDataDef<ItemDesc> = {
    columns: [
        headerColumn({
            route: item => ["item", item.id],
            prefixElement: item => <ItemIcon item={item} small/>,
        }),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        statsColumn<ItemDesc>("Stats", {accessorFn: getConsolidatedItemStats}),
        {
            id: "Volume",
            accessorKey: "volume",
            filterFn: 'inNumberRange',
            cell: (props) => (
                <Tooltip openOnTouchStart>
                    <TooltipTrigger>{props.row.original.volume}</TooltipTrigger>
                    <TooltipContent class="max-w-[90svw]">
                        Inventory stack: {6000 / props.row.original.volume}
                    </TooltipContent>
                </Tooltip>
            )
        },
        descriptionColumn(),
        boolColumn("Is Item List", { accessorFn: i => i.itemListId !== 0 }),
        rowActions(undefined, "item"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        statsFilter("Stats"),
        rangeFilter("Volume"),
        boolFilter("Is Item List")
    ],
    searchColumns: ["Name", "Description"],
}