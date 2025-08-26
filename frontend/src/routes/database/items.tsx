import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {ItemDesc} from "~/bindings/src";
import {ItemDescDefs} from "~/lib/table-defs/itemdesc-table";


export default function Items() {
    const itemDescList = BitCraftTables.ItemDesc;
    const defs = ItemDescDefs;

    return (
        <TableLayout<ItemDesc>
            title="Items"
            items={itemDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
