import {ItemDesc} from "~/bindings/src/item_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {ItemDescDefs} from "~/lib/table-defs/item-table";


export default function Items() {
    return (
        <TableLayout<ItemDesc>
            title={PAGE_TITLE_LABELS["/database/item"]}
            items={BitCraftTables.ItemDesc.get}
            colDefs={ItemDescDefs}
        />
    )
}
