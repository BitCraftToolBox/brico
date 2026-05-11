import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {TravelerTaskDefs} from "~/lib/table-defs/traveler-tasks-table";


export default function TravelerTasks() {
    return (
        <TableLayout<TravelerTaskDesc>
            title="Traveler Tasks"
            items={BitCraftTables.TravelerTaskDesc.get}
            colDefs={TravelerTaskDefs}
        />
    )
}
