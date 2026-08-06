import {TerraformRecipeDesc} from "~/bindings/src/terraform_recipe_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
