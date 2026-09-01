import {ResourceDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
