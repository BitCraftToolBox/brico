import {FoodDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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

