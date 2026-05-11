import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {DeployableDescDefs} from "~/lib/table-defs/deployables-table";


export default function Deployables() {
    return (
        <TableLayout<DeployableDesc>
            title="Deployables"
            items={BitCraftTables.DeployableDesc.get}
            colDefs={DeployableDescDefs}
        />
    )
}
