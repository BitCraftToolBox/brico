import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {DeployableDescDefs} from "~/lib/table-defs/deployables-table";


export default function Deployables() {
    return (
        <TableLayout<DeployableDesc>
            title={PAGE_TITLE_LABELS["/database/deployable"]}
            items={BitCraftTables.DeployableDesc.get}
            colDefs={DeployableDescDefs}
        />
    )
}
