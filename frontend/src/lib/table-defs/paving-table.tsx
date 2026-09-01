import {PavingTileDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {GameIcon} from "~/components/shared/GameIcon";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, knowledgeColumn, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions} from "~/lib/utils";

export const PavingDefs: BitCraftToDataDef<PavingTileDesc> = {
    columns: [
        headerColumn({
            route: paving => ["paving", paving.id],
            prefixElement: paving => <GameIcon name={paving.name} iconAsset={paving.iconAddress} shape="square" small noInteract/>,
        }),
        descriptionColumn(),
        tierColumn(),
        statsColumn(undefined, {accessorKey: "statEffects"}),
        knowledgeColumn(),
        rowActions(),
    ],
    facetedFilters: [
        tierFilter(),
        statsFilter(),
        uniqueValuesFilter("Required Knowledge", msg`Required Knowledge`, compareOptions)
    ],
    searchColumns: ["Name", "Description"],
};
