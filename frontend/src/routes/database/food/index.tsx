import {FoodDesc} from "~/bindings/src/food_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {FoodDefs} from "~/lib/table-defs/food-table";

export default function Food() {
    return (
        <TableLayout<FoodDesc>
            title="Food"
            items={BitCraftTables.FoodDesc.get}
            colDefs={FoodDefs}
        />
    );
}

