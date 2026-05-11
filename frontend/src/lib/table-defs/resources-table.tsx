import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {ResourceIcon} from "~/components/shared/GameIcon";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rarityColumn, rarityFilter, rowActions, tagColumn, tagFilter, tierColumn, tierFilter} from "~/lib/table-utils/column-builders";


export const ResourceDescDefs: BitCraftToDataDef<ResourceDesc> = {
    columns: [
        headerColumn({
            route: res => ["resource", res.id],
            prefixElement: res => <ResourceIcon res={res} small/>,
        }),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        rowActions(undefined, "res", "resourceId"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
    ],
    searchColumns: ["Name"],
}
