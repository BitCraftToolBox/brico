import {ProspectingDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {ProspectingDefs} from "~/lib/table-defs/prospecting-table";

export default function Prospecting() {
    return (
        <TableLayout<ProspectingDesc>
            title={PAGE_TITLE_LABELS["/database/prospecting"]}
            items={BitCraftTables.ProspectingDesc.get}
            colDefs={ProspectingDefs}
        />
    );
}
