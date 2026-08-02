import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
