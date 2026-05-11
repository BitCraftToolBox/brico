import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {CollectibleDefs} from "~/lib/table-defs/collectible-table";

export default function Collectibles() {
    return (
        <TableLayout<CollectibleDesc>
            title="Collectibles"
            items={BitCraftTables.CollectibleDesc.get}
            colDefs={CollectibleDefs}
        />
    );
}
