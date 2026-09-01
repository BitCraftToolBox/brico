import {ToolDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
