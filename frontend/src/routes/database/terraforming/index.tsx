import {TerraformRecipeDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {TerraformingDefs} from "~/lib/table-defs/terraforming-table";

export default function Terraforming() {
    return (
        <TableLayout<TerraformRecipeDesc>
            title={PAGE_TITLE_LABELS["/database/terraforming"]}
            idAccessor={{accessorKey: "difference"}}
            items={BitCraftTables.TerraformRecipeDesc.get}
            colDefs={TerraformingDefs}
        />
    );
}
