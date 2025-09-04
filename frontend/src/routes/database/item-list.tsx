import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {ItemListDesc} from "~/bindings/src";
import {ItemListDescDefs} from "~/lib/table-defs/item-list-table";

export default function ItemList() {
    const itemListDescList = BitCraftTables.ItemListDesc;
    const defs = ItemListDescDefs;

    return (
        <TableLayout<ItemListDesc>
            title="Item Lists"
            items={itemListDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}