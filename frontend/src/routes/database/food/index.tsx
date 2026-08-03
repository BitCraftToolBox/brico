import {FoodDesc} from "~/bindings/src/food_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {FoodDefs} from "~/lib/table-defs/food-table";

export default function Food() {
    return (
        <TableLayout<FoodDesc>
            title={PAGE_TITLE_LABELS["/database/food"]}
            idAccessor={{accessorKey: "itemId"}}
            items={BitCraftTables.FoodDesc.get}
            colDefs={FoodDefs}
        />
    );
}

