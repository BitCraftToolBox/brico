import {msg} from "@lingui/core/macro";
import {PillarShapingDesc} from "~/bindings/src/pillar_shaping_desc_type";
import {GameIcon} from "~/components/shared/GameIcon";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, knowledgeColumn, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareOptions} from "~/lib/utils";

export const PillarShapingDefs: BitCraftToDataDef<PillarShapingDesc> = {
    columns: [
        headerColumn({
            route: pillar => ["pillar-shaping", pillar.id],
            prefixElement: pillar => <GameIcon name={pillar.name} iconAsset={pillar.iconAddress} shape="square" small noInteract/>,
        }),
        descriptionColumn(),
        tierColumn(),
        knowledgeColumn(),
        rowActions(),
    ],
    facetedFilters: [
        tierFilter(),
        uniqueValuesFilter("Required Knowledge", msg`Required Knowledge`, compareOptions),
    ],
    searchColumns: ["Name", "Description"],
};
