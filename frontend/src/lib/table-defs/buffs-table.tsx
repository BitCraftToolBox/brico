import {msg} from "@lingui/core/macro";
import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, includedIn} from "~/lib/utils";

export const BuffDefs: BitCraftToDataDef<BuffDesc> = {
    columns: [
        headerColumn<BuffDesc, any>({
            accessor: {accessorFn: buff => buff.description || `Buff #${buff.id}`},
            route: buff => ["buff", buff.id],
            prefixElement: buff => (
                <FontIcon codepoint={buff.iconAssetName}/>
            )
        }),
        descriptionColumn(),
        {
            id: "Buff Type",
            meta: {label: msg`Type`},
            // English value — this column is filterable, so it ends up in shared URLs.
            // See the note at the top of table-utils/column-builders.tsx.
            accessorFn: row => row.buffTypeId ? sourceRow(BitCraftTables.BuffTypeDesc.indexedBy("id")().get(row.buffTypeId))?.name ?? `#${row.buffTypeId}` : undefined,
            cell: props => translateGameText(props.getValue() as string ?? ""),
            filterFn: includedIn<BuffDesc>(),
        },
        statsColumn<BuffDesc>(),
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Buff Type", msg`Type`, compareOptions),
        statsFilter(),
    ],
    searchColumns: ["Name", "Description"],
};
