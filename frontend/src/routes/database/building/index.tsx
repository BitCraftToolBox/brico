import {BuildingDesc} from "~/bindings/src/building_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {BuildingDescDefs} from "~/lib/table-defs/buildings-table";


export default function Buildings() {
    return (
        <TableLayout<BuildingDesc>
            title={PAGE_TITLE_LABELS["/database/building"]}
            items={BitCraftTables.BuildingDesc.get}
            colDefs={BuildingDescDefs}
        />
    )
}
