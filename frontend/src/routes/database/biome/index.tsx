import {BiomeDesc} from "~/bindings/src/biome_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {BiomeDefs} from "~/lib/table-defs/biome-table";

export default function Biomes() {
    return (
        <TableLayout<BiomeDesc>
            title={PAGE_TITLE_LABELS["/database/biome"]}
            idAccessor={{accessorKey: "biomeType"}}
            items={BitCraftTables.BiomeDesc.get}
            colDefs={BiomeDefs}
        />
    );
}
