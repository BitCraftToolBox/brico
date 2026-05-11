import {ItemDesc} from "~/bindings/src/item_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ItemDescDefs} from "~/lib/table-defs/item-table";


export default function Items() {
    return (
        <TableLayout<ItemDesc>
            title="Items"
            items={BitCraftTables.ItemDesc.get}
            colDefs={ItemDescDefs}
        />
    )
}
