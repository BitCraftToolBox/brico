import {BuildingDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
