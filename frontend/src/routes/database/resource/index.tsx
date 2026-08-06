import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {ResourceDescDefs} from "~/lib/table-defs/resources-table";


export default function Resources() {
    return (
        <TableLayout<ResourceDesc>
            title={PAGE_TITLE_LABELS["/database/resource"]}
            items={BitCraftTables.ResourceDesc.get}
            colDefs={ResourceDescDefs}
        />
    )
}
