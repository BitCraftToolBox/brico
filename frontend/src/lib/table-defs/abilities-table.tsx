import {msg} from "@lingui/core/macro";
import {AbilityCustomDesc} from "~/bindings/src/ability_custom_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {gameText} from "~/lib/labels";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {buffsColumn, buffStatsColumn, headerColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, fixFloat, readableSeconds} from "~/lib/utils";

/**
 * Deliberately narrow: `castTime`, `range`, `radius`, `damage`, `threatValue`, `globalCooldown` and
 * `linkedAbilityBuffDescId` are 0 for every row, `friendly` is always true, `buffToggle` always
 * false, and `animation` is `"None"`/`""` — none of them tell the reader anything. The Raw Data tab
 * on the detail page still exposes the full row. This can change as new abilities are added.
 *
 * What an ability actually *is* is the buffs it applies, so those get both a linked-pill column and
 * a consolidated stat column, exactly as food does.
 */
export const AbilityDefs: BitCraftToDataDef<AbilityCustomDesc> = {
    columns: [
        headerColumn<AbilityCustomDesc, any>({
            accessor: {accessorKey: "abilityName"},
            route: ability => ["ability", ability.id],
            prefixElement: ability => (
                <FontIcon codepoint={ability.iconPath}/>
            ),
        }),
        buffsColumn<AbilityCustomDesc>({accessorKey: "buffs"}),
        buffStatsColumn<AbilityCustomDesc>({accessorKey: "buffs"}, "Buff Stats", msg`Buff Stats`),
        {
            id: "Stamina Cost", meta: {label: gameText(msg`Stamina Cost`)}, accessorKey: "staminaCost",
            filterFn: "inNumberRange",
        },
        {
            id: "Cooldown", meta: {label: gameText(msg`Cooldown`)}, accessorKey: "cooldown",
            cell: p => <span>{readableSeconds(fixFloat(p.getValue() as number))}</span>,
            filterFn: "inNumberRange",
        },
        rowActions(undefined, "ability"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Buffs", msg`Buffs`, compareOptions),
        statsFilter("Buff Stats", msg`Buff Stats`),
        rangeFilter("Stamina Cost", gameText(msg`Stamina Cost`)),
        rangeFilter("Cooldown", gameText(msg`Cooldown`)),
    ],
    searchColumns: ["Name"],
};
