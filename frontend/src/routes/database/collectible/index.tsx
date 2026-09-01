import {CollectibleDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
