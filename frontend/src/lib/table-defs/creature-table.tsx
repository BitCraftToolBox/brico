import {msg} from "@lingui/core/macro";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {EnemyIcon} from "~/components/shared/GameIcon";
import {gameText} from "~/lib/labels";
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
        {id: "Max Health", meta: {label: gameText(msg`Max Health`)}, accessorKey: "maxHealth", filterFn: "inNumberRange"},
        {id: "Armor", meta: {label: gameText(msg`Armor`)}, accessorKey: "armor", filterFn: "inNumberRange"},
        {id: "Accuracy", meta: {label: gameText(msg`Accuracy`)}, accessorKey: "accuracy", filterFn: "inNumberRange"},
        {id: "Evasion", meta: {label: gameText(msg`Evasion`)}, accessorKey: "evasion", filterFn: "inNumberRange"},
        {id: "Strength", meta: {label: gameText(msg`Strength`)}, accessorKey: "strength", filterFn: "inNumberRange"},
        {id: "Min Damage", meta: {label: gameText(msg`Min Damage`)}, accessorKey: "minDamage", filterFn: "inNumberRange"},
        {id: "Max Damage", meta: {label: gameText(msg`Max Damage`)}, accessorKey: "maxDamage", filterFn: "inNumberRange"},
        boolColumn("Huntable", {accessorKey: "huntable"}, msg`Huntable`),
        {id: "Attack Level", meta: {label: msg`Attack Level`}, accessorKey: "attackLevel", filterFn: includedIn()},
        {id: "Defense Level", meta: {label: msg`Defense Level`}, accessorKey: "defenseLevel", filterFn: includedIn()},
        descriptionColumn(),
        rowActions({accessorKey: "enemyType" as any}, "mob", "enemyId"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Max Health", gameText(msg`Max Health`)),
        rangeFilter("Armor", gameText(msg`Armor`)),
        rangeFilter("Accuracy", gameText(msg`Accuracy`)),
        rangeFilter("Evasion", gameText(msg`Evasion`)),
        rangeFilter("Strength", gameText(msg`Strength`)),
        rangeFilter("Min Damage", gameText(msg`Min Damage`)),
        rangeFilter("Max Damage", gameText(msg`Max Damage`)),
        boolFilter("Huntable", msg`Huntable`),
        uniqueValuesFilter("Attack Level", msg`Attack Level`),
        uniqueValuesFilter("Defense Level", msg`Defense Level`),
    ],
    searchColumns: ["Name", "Description"],
};
