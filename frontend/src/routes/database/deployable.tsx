import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {DeployableDescV2} from "~/bindings/src";
import {DeployableDescDefs} from "~/lib/table-defs/deployables-table";


export default function Deployables() {
    const cargoDescList = BitCraftTables.DeployableDesc;
    const defs = DeployableDescDefs;

    return (
        <TableLayout<DeployableDescV2>
            title="Deployables"
            items={cargoDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
