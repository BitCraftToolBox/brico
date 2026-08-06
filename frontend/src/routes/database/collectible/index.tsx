import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {CollectibleDefs} from "~/lib/table-defs/collectible-table";

export default function Collectibles() {
    return (
        <TableLayout<CollectibleDesc>
            title={PAGE_TITLE_LABELS["/database/collectible"]}
            items={BitCraftTables.CollectibleDesc.get}
            colDefs={CollectibleDefs}
        />
    );
}
