import {ItemDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
