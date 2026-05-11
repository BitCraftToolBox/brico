import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ItemListDescDefs} from "~/lib/table-defs/item-list-table";

export default function ItemList() {
    return (
        <TableLayout<ItemListDesc>
            title="Item Lists"
            items={BitCraftTables.ItemListDesc.get}
            colDefs={ItemListDescDefs}
        />
    )
}