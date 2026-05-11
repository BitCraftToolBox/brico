import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolColumn, boolFilter, headerColumn, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {fixFloat, includedIn} from "~/lib/utils";

export const CombatDefs: BitCraftToDataDef<CombatActionDesc> = {
    columns: [
        headerColumn({
            route: comAct => ["combat", comAct.id],
            prefixElement: comAct => (
                <FontIcon codepoint={comAct.iconAssetName}/>
            )
        }),
        boolColumn("Player Ability", {accessorKey: "learnedByPlayer"}),
        {
            id: "Weapon Type",
            accessorFn: (row) => {
                const idx = BitCraftTables.WeaponTypeDesc.indexedBy("id");
                return row.weaponTypeRequirements?.map(id => idx?.()?.get(id)?.name ?? `#${id}`).join(", ");
            },
            filterFn: includedIn<CombatActionDesc>()
        },
        {id: "Max Range", accessorKey: "maxRange", filterFn: "inNumberRange"},
        {
            id: "Cooldown", accessorKey: "cooldown",
            cell: (props) => <span>{fixFloat(props.row.original.cooldown)}</span>,
            filterFn: "inNumberRange",
        },
        {
            id: "Strength Multiplier", accessorKey: "strengthMultiplier",
            cell: (props) => <span>{fixFloat(props.row.original.strengthMultiplier)}x</span>,
        },
        rowActions(),
    ],
    facetedFilters: [
        boolFilter("Player Ability"),
        uniqueValuesFilter("Weapon Type"),
        //rangeFilter("Max Range"),
    ],
    searchColumns: ["Name"],
};
