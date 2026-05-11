import {BiomeDesc} from "~/bindings/src/biome_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {BiomeDefs} from "~/lib/table-defs/biome-table";

export default function Biomes() {
    return (
        <TableLayout<BiomeDesc>
            title="Biomes"
            items={BitCraftTables.BiomeDesc.get}
            colDefs={BiomeDefs}
        />
    );
}
