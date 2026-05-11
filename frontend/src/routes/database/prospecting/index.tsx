import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ProspectingDefs} from "~/lib/table-defs/prospecting-table";

export default function Prospecting() {
    return (
        <TableLayout<ProspectingDesc>
            title="Prospecting"
            items={BitCraftTables.ProspectingDesc.get}
            colDefs={ProspectingDefs}
        />
    );
}
