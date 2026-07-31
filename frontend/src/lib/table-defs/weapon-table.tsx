import {msg} from "@lingui/core/macro";
import {Rarity} from "~/bindings/src/rarity_type";
import {WeaponDesc} from "~/bindings/src/weapon_desc_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {fixFloat, includedIn} from "~/lib/utils";

export const WeaponDefs: BitCraftToDataDef<WeaponDesc> = {
    columns: [
        headerColumn({
            title: "Name",
            accessor: {accessorFn: wep => BitCraftTables.ItemDesc.indexedBy("id")().get(wep.itemId)?.name ?? `Item #${wep.itemId}`},
            route: wep => ["weapon", wep.itemId],
            prefixElement: wep => {
                const item = (() => BitCraftTables.ItemDesc.indexedBy("id")().get(wep.itemId))();
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {
            id: "Weapon Type",
            meta: {label: msg`Weapon Type`},
            // English value — this column is filterable, so it ends up in shared URLs.
            // See the note at the top of table-utils/column-builders.tsx.
            accessorFn: (row) => sourceRow(BitCraftTables.WeaponTypeDesc.indexedBy("id")().get(row.weaponType))?.name ?? `#${row.weaponType}`,
            cell: props => translateGameText(props.getValue() as string ?? ""),
            filterFn: includedIn<WeaponDesc>()
        },
        tierColumn(),
        rarityColumn({accessorFn: (row) => BitCraftTables.ItemDesc.indexedBy("id")().get(row.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}),
        {id: "Min Damage", meta: {label: msg`Min Damage`}, accessorKey: "minDamage", filterFn: "inNumberRange"},
        {id: "Max Damage", meta: {label: msg`Max Damage`}, accessorKey: "maxDamage", filterFn: "inNumberRange"},
        {
            id: "Cooldown", meta: {label: msg`Cooldown`}, accessorKey: "cooldown",
            cell: (props) => <span>{fixFloat(props.row.original.cooldown)}</span>,
            filterFn: "inNumberRange",
        },
        {
            id: "Stamina Use Multiplier", meta: {label: msg`Stamina Use Multiplier`}, accessorKey: "staminaUseMultiplier",
            cell: (props) => <span>{fixFloat(props.row.original.staminaUseMultiplier)}x</span>,
        },
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Weapon Type", msg`Weapon Type`),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Min Damage", msg`Min Damage`),
        rangeFilter("Max Damage", msg`Max Damage`),
        rangeFilter("Cooldown", msg`Cooldown`),
        rangeFilter("Stamina Use Multiplier", msg`Stamina Use Multiplier`),
    ],
    searchColumns: ["Name"],
};

