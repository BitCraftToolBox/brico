import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ResourceDescDefs} from "~/lib/table-defs/resources-table";


export default function Resources() {
    return (
        <TableLayout<ResourceDesc>
            title="Resources"
            items={BitCraftTables.ResourceDesc.get}
            colDefs={ResourceDescDefs}
        />
    )
}
