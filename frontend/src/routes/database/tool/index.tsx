import {ToolDesc} from "~/bindings/src/tool_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ToolDefs} from "~/lib/table-defs/tools-table";

export default function Tools() {
    return (
        <TableLayout<ToolDesc>
            title="Tools"
            items={BitCraftTables.ToolDesc.get}
            colDefs={ToolDefs}
        />
    );
}
