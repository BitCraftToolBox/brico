import {ToolDesc} from "~/bindings/src/tool_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {ToolDefs} from "~/lib/table-defs/tools-table";

export default function Tools() {
    return (
        <TableLayout<ToolDesc>
            title={PAGE_TITLE_LABELS["/database/tool"]}
            items={BitCraftTables.ToolDesc.get}
            colDefs={ToolDefs}
        />
    );
}
