import {DeployableDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
