import {PavingTileDesc} from "~/bindings/src/paving_tile_desc_type";
import {GameIcon} from "~/components/shared/GameIcon";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, knowledgeColumn, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareOptions} from "~/lib/utils";

export const PavingDefs: BitCraftToDataDef<PavingTileDesc> = {
    columns: [
        headerColumn({
            route: paving => ["paving", paving.id],
            prefixElement: paving => <GameIcon name={paving.name} iconAsset={paving.iconAddress} shape="square" small noInteract/>,
        }),
        descriptionColumn(),
        tierColumn(),
        knowledgeColumn(),
        rowActions(),
    ],
    facetedFilters: [
        tierFilter(),
        uniqueValuesFilter("Required Knowledge", undefined, compareOptions),
    ],
    searchColumns: ["Name", "Description"],
};
