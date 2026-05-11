import {BiomeDesc} from "~/bindings/src/biome_desc_type";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rowActions} from "~/lib/table-utils/column-builders";

export const BiomeDefs: BitCraftToDataDef<BiomeDesc> = {
    columns: [
        headerColumn({
            route: bio => ["biome", bio.biomeType],
        }),
        descriptionColumn(),
        {id: "Hazard", accessorKey: "hazardLevel"},
        rowActions({accessorKey: "biomeType" as any}),
    ],
    searchColumns: ["Name", "Description"],
};
