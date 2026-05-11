import {Rarity} from "~/bindings/src/rarity_type";
import {WeaponDesc} from "~/bindings/src/weapon_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {fixFloat, includedIn} from "~/lib/utils";

export const WeaponDefs: BitCraftToDataDef<WeaponDesc> = {
    columns: [
        headerColumn({
            title: "Name",
            accessor: {accessorFn: wep => BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(wep.itemId)?.name ?? `Item #${wep.itemId}`},
            route: wep => ["weapon", wep.itemId],
            prefixElement: wep => {
                const item = (() => BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(wep.itemId))();
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {
            id: "Weapon Type",
            accessorFn: (row) => BitCraftTables.WeaponTypeDesc.indexedBy("id")?.()?.get(row.weaponType)?.name ?? `#${row.weaponType}`,
            filterFn: includedIn<WeaponDesc>()
        },
        tierColumn(),
        rarityColumn({accessorFn: (row) => BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(row.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}),
        {id: "Min Damage", accessorKey: "minDamage", filterFn: "inNumberRange"},
        {id: "Max Damage", accessorKey: "maxDamage", filterFn: "inNumberRange"},
        {
            id: "Cooldown", accessorKey: "cooldown",
            cell: (props) => <span>{fixFloat(props.row.original.cooldown)}</span>,
            filterFn: "inNumberRange",
        },
        {
            id: "Stamina Use Multiplier", accessorKey: "staminaUseMultiplier",
            cell: (props) => <span>{fixFloat(props.row.original.staminaUseMultiplier)}x</span>,
        },
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Weapon Type"),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Min Damage"),
        rangeFilter("Max Damage"),
        rangeFilter("Cooldown"),
        rangeFilter("Stamina Use Multiplier"),
    ],
    searchColumns: ["Name"],
};

