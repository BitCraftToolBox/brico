import {BuildingDesc} from "~/bindings/src/building_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {BuildingDescDefs} from "~/lib/table-defs/buildings-table";


export default function Buildings() {
    return (
        <TableLayout<BuildingDesc>
            title="Buildings"
            items={BitCraftTables.BuildingDesc.get}
            colDefs={BuildingDescDefs}
        />
    )
}
