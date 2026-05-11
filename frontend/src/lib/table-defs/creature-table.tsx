import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {EnemyIcon} from "~/components/shared/GameIcon";
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
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const CreatureDefs: BitCraftToDataDef<EnemyDesc> = {
    columns: [
        headerColumn({
            route: enemy => ["creature", enemy.enemyType],
            prefixElement: enemy => <EnemyIcon enemy={enemy} small/>,
        }),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        {id: "Max Health", accessorKey: "maxHealth", filterFn: "inNumberRange"},
        {id: "Armor", accessorKey: "armor", filterFn: "inNumberRange"},
        {id: "Accuracy", accessorKey: "accuracy", filterFn: "inNumberRange"},
        {id: "Evasion", accessorKey: "evasion", filterFn: "inNumberRange"},
        {id: "Strength", accessorKey: "strength", filterFn: "inNumberRange"},
        {id: "Min Damage", accessorKey: "minDamage", filterFn: "inNumberRange"},
        {id: "Max Damage", accessorKey: "maxDamage", filterFn: "inNumberRange"},
        boolColumn("Huntable", {accessorKey: "huntable"}),
        {id: "Attack Level", accessorKey: "attackLevel", filterFn: includedIn()},
        {id: "Defense Level", accessorKey: "defenseLevel", filterFn: includedIn()},
        descriptionColumn(),
        rowActions({accessorKey: "enemyType" as any}, "mob"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Max Health"),
        rangeFilter("Armor"),
        rangeFilter("Accuracy"),
        rangeFilter("Evasion"),
        rangeFilter("Strength"),
        rangeFilter("Min Damage"),
        rangeFilter("Max Damage"),
        boolFilter("Huntable"),
        uniqueValuesFilter("Attack Level"),
        uniqueValuesFilter("Defense Level"),
    ],
    searchColumns: ["Name", "Description"],
};
