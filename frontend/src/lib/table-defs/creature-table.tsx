import {msg} from "@lingui/core/macro";
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
        {id: "Max Health", meta: {label: msg`Max Health`}, accessorKey: "maxHealth", filterFn: "inNumberRange"},
        {id: "Armor", meta: {label: msg`Armor`}, accessorKey: "armor", filterFn: "inNumberRange"},
        {id: "Accuracy", meta: {label: msg`Accuracy`}, accessorKey: "accuracy", filterFn: "inNumberRange"},
        {id: "Evasion", meta: {label: msg`Evasion`}, accessorKey: "evasion", filterFn: "inNumberRange"},
        {id: "Strength", meta: {label: msg`Strength`}, accessorKey: "strength", filterFn: "inNumberRange"},
        {id: "Min Damage", meta: {label: msg`Min Damage`}, accessorKey: "minDamage", filterFn: "inNumberRange"},
        {id: "Max Damage", meta: {label: msg`Max Damage`}, accessorKey: "maxDamage", filterFn: "inNumberRange"},
        boolColumn("Huntable", {accessorKey: "huntable"}, msg`Huntable`),
        {id: "Attack Level", meta: {label: msg`Attack Level`}, accessorKey: "attackLevel", filterFn: includedIn()},
        {id: "Defense Level", meta: {label: msg`Defense Level`}, accessorKey: "defenseLevel", filterFn: includedIn()},
        descriptionColumn(),
        rowActions({accessorKey: "enemyType" as any}, "mob"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Max Health", msg`Max Health`),
        rangeFilter("Armor", msg`Armor`),
        rangeFilter("Accuracy", msg`Accuracy`),
        rangeFilter("Evasion", msg`Evasion`),
        rangeFilter("Strength", msg`Strength`),
        rangeFilter("Min Damage", msg`Min Damage`),
        rangeFilter("Max Damage", msg`Max Damage`),
        boolFilter("Huntable", msg`Huntable`),
        uniqueValuesFilter("Attack Level", msg`Attack Level`),
        uniqueValuesFilter("Defense Level", msg`Defense Level`),
    ],
    searchColumns: ["Name", "Description"],
};
