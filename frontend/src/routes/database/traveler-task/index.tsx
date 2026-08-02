import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
