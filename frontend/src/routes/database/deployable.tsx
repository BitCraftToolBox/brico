import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {DeployableDesc} from "~/bindings/ts";
import {DeployableDescDefs} from "~/lib/table-defs/deployables-table";


export default function Cargo() {
    const cargoDescList = BitCraftTables.DeployableDesc;
    const defs = DeployableDescDefs;

    return (
        <TableLayout<DeployableDesc>
            title="Deployables"
            items={cargoDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
