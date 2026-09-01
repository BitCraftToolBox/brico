import {TravelerTaskDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {TravelerTaskDefs} from "~/lib/table-defs/traveler-tasks-table";


export default function TravelerTasks() {
    return (
        <TableLayout<TravelerTaskDesc>
            title={PAGE_TITLE_LABELS["/database/traveler-task"]}
            items={BitCraftTables.TravelerTaskDesc.get}
            colDefs={TravelerTaskDefs}
        />
    )
}
