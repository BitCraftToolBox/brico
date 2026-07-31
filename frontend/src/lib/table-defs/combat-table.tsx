import {msg} from "@lingui/core/macro";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {sourceRow, translateGameText} from "~/lib/data-translation";
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
        boolColumn("Player Ability", {accessorKey: "learnedByPlayer"}, msg`Player Ability`),
        {
            id: "Weapon Type",
            meta: {label: msg`Weapon Type`},
            // English value — this column is filterable, so it ends up in shared URLs.
            // See the note at the top of table-utils/column-builders.tsx.
            accessorFn: (row) => {
                const idx = BitCraftTables.WeaponTypeDesc.indexedBy("id")();
                return row.weaponTypeRequirements?.map(id => sourceRow(idx.get(id))?.name ?? `#${id}`).join(", ");
            },
            cell: props => translateGameText(props.getValue() as string ?? ""),
            filterFn: includedIn<CombatActionDesc>()
        },
        {id: "Max Range", meta: {label: msg`Max Range`}, accessorKey: "maxRange", filterFn: "inNumberRange"},
        {
            id: "Cooldown", meta: {label: msg`Cooldown`}, accessorKey: "cooldown",
            cell: (props) => <span>{fixFloat(props.row.original.cooldown)}</span>,
            filterFn: "inNumberRange",
        },
        {
            id: "Strength Multiplier", meta: {label: msg`Strength Multiplier`}, accessorKey: "strengthMultiplier",
            cell: (props) => <span>{fixFloat(props.row.original.strengthMultiplier)}x</span>,
        },
        rowActions(),
    ],
    facetedFilters: [
        boolFilter("Player Ability", msg`Player Ability`),
        uniqueValuesFilter("Weapon Type", msg`Weapon Type`),
        //rangeFilter("Max Range"),
    ],
    searchColumns: ["Name"],
};
