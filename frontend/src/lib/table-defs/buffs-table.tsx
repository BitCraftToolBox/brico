import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, includedIn} from "~/lib/utils";

export const BuffDefs: BitCraftToDataDef<BuffDesc> = {
    columns: [
        headerColumn<BuffDesc, any>({
            title: "Name",
            accessor: {accessorFn: buff => buff.description || `Buff #${buff.id}`},
            route: buff => ["buff", buff.id],
            prefixElement: buff => (
                <FontIcon codepoint={buff.iconAssetName}/>
            )
        }),
        descriptionColumn(),
        {
            id: "Buff Type",
            accessorFn: row => row.buffTypeId ? BitCraftTables.BuffTypeDesc.indexedBy("id")?.()?.get(row.buffTypeId)?.name ?? `#${row.buffTypeId}` : undefined,
            filterFn: includedIn<BuffDesc>(),
        },
        statsColumn<BuffDesc>(),
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Buff Type", undefined, compareOptions),
        statsFilter("Stats"),
    ],
    searchColumns: ["Name", "Description"],
};
