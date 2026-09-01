import {ItemListDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {ItemListDescDefs} from "~/lib/table-defs/item-list-table";

export default function ItemList() {
    return (
        <TableLayout<ItemListDesc>
            title={PAGE_TITLE_LABELS["/database/item-list"]}
            items={BitCraftTables.ItemListDesc.get}
            colDefs={ItemListDescDefs}
        />
    )
}