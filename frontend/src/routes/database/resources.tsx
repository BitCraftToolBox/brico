import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {ResourceDesc} from "~/bindings/ts";
import {ResourceDescDefs} from "~/lib/table-defs/resources-table";


export default function Resources() {
    const resourceDescList = BitCraftTables.ResourceDesc;
    const defs = ResourceDescDefs;

    return (
        <TableLayout<ResourceDesc>
            title="Resources"
            items={resourceDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
