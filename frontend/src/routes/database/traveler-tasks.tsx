import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {TravelerTaskDesc} from "~/bindings/ts";
import {TravelerTaskDefs} from "~/lib/table-defs/traveler-tasks-table";


export default function TravelerTasks() {
    const taskDescList = BitCraftTables.TravelerTaskDesc;
    const defs = TravelerTaskDefs;

    return (
        <TableLayout<TravelerTaskDesc>
            title="Traveler Tasks"
            items={taskDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Description"}
        >
        </TableLayout>
    )
}
