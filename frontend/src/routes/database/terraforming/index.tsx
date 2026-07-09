import {TerraformRecipeDesc} from "~/bindings/src/terraform_recipe_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {TerraformingDefs} from "~/lib/table-defs/terraforming-table";

export default function Terraforming() {
    return (
        <TableLayout<TerraformRecipeDesc>
            title="Terraforming"
            items={BitCraftTables.TerraformRecipeDesc.get}
            colDefs={TerraformingDefs}
        />
    );
}
