import {ResourceDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {Show} from "solid-js";
import {ResourceIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip.tsx";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tagColumn, tagFilter, tierColumn, tierFilter} from "~/lib/table-utils/column-builders";
import {readableSeconds} from "~/lib/utils.ts";


export const ResourceDescDefs: BitCraftToDataDef<ResourceDesc> = {
    columns: [
        headerColumn({
            route: res => ["resource", res.id],
            prefixElement: res => <ResourceIcon res={res} small/>,
        }),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        {
            id: "Max Health",
            meta: {label: msg`Max Health`},
            accessorKey: "maxHealth",
            filterFn: "inNumberRange",
            cell: (props) => (
                <Tooltip openOnTouchStart disabled={!props.row.original.ignoreDamage}>
                    <TooltipTrigger class={props.row.original.ignoreDamage ? "decoration-dotted underline" : ""}>{props.getValue()}</TooltipTrigger>
                    <TooltipContent class="max-w-[90svw]">
                        <Show when={props.row.original.ignoreDamage}>
                            <Trans>Resource ignores regular damage.</Trans>
                        </Show>
                    </TooltipContent>
                </Tooltip>
            )
        },
        {
            id: "Scheduled Respawn",
            meta: {label: msg`Scheduled Respawn`},
            accessorKey: "scheduledRespawnTime",
            filterFn: "inNumberRange",
            cell: (props) => (
                <Tooltip openOnTouchStart>
                    <TooltipTrigger>{props.row.original.scheduledRespawnTime > 0 ? readableSeconds(props.row.original.scheduledRespawnTime) : "—"}</TooltipTrigger>
                    <TooltipContent class="max-w-[90svw]">
                        <Show when={props.row.original.scheduledRespawnTime > 0} fallback={<Trans>Variable respawn. Spawns randomly among valid areas in the region when available resource count drops below a threshold.</Trans>}>
                            <Trans>Fixed respawn. Spawns in the same chunk after specified amount of time.</Trans>
                        </Show>
                    </TooltipContent>
                </Tooltip>
            )
        },
        rowActions(undefined, "res", "resourceId"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Max Health", msg`Max Health`),
        rangeFilter("Scheduled Respawn", msg`Scheduled Respawn`),
    ],
    searchColumns: ["Name"],
}
