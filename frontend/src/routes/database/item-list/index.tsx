import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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