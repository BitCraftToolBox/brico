import {msg} from "@lingui/core/macro";
import {FoodDesc} from "~/bindings/src/food_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {gameText} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    boolFilter,
    buffsColumn,
    buffStatsColumn,
    headerColumn,
    rangeFilter,
    rarityColumn,
    rarityFilter,
    rowActions,
    tierColumn,
    tierFilter,
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, fixFloat} from "~/lib/utils";

export const FoodDefs: BitCraftToDataDef<FoodDesc> = {
    columns: [
        headerColumn<FoodDesc, any>({
            accessor: {accessorFn: food => BitCraftTables.ItemDesc.indexedBy("id")().get(food.itemId)?.name ?? `Item #${food.itemId}`},
            // Row-click goes to the item page, not a dedicated food page: it renders a
            // superset of these fields inline. See `DetailRoute` in table-utils/column-builders.
            route: food => ["item", food.itemId],
            prefixElement: food => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")().get(food.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {id: "Satiation", meta: {label: gameText(msg`Satiation`)}, accessorKey: "hunger", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        buffsColumn<FoodDesc>({accessorKey: "buffs"}),
        buffStatsColumn<FoodDesc>({accessorKey: "buffs"}, "Buff Stats", gameText(msg`Stats`)),
        {id: "TP Energy", meta: {label: gameText(msg`TP Energy`, "Teleportation Energy")}, accessorKey: "teleportationEnergy", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "HP", meta: {label: gameText(msg`HP`, "Health")}, accessorKey: "hp", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Up To HP", meta: {label: gameText(msg`Min Health`)}, accessorKey: "upToHp", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Stamina", meta: {label: gameText(msg`Stamina`)}, accessorKey: "stamina", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Up To Stamina", meta: {label: gameText(msg`Min Stamina`)}, accessorKey: "upToStamina", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        boolColumn<FoodDesc, boolean>("Consumable In Combat", {accessorKey: "consumableWhileInCombat"}, msg`Consumable In Combat`),
        boolColumn<FoodDesc, boolean>("Auto Consume", {accessorKey: "autoConsume"}, msg`Auto Consume`),
        tierColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        rangeFilter("Satiation", gameText(msg`Satiation`)),
        uniqueValuesFilter("Buffs", msg`Buffs`, compareOptions),
        statsFilter("Buff Stats", gameText(msg`Stats`)),
        rangeFilter("TP Energy", gameText(msg`TP Energy`, "Teleportation Energy")),
        rangeFilter("HP", gameText(msg`HP`, "Health")),
        rangeFilter("Up To HP", gameText(msg`Max Health`)),
        rangeFilter("Stamina", gameText(msg`Stamina`)),
        rangeFilter("Up To Stamina", gameText(msg`Max Stamina`)),
        boolFilter("Consumable In Combat", msg`Consumable In Combat`),
        boolFilter("Auto Consume", msg`Auto Consume`),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"]
};
