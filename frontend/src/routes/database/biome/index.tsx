import {BiomeDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
