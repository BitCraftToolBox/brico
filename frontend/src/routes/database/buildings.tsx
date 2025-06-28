import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {BuildingDesc} from "~/bindings/ts";
import {BuildingDescDefs} from "~/lib/table-defs/buildings-table";


export default function Buildings() {
    const buildingDescList = BitCraftTables.BuildingDesc;
    const defs = BuildingDescDefs;

    return (
        <TableLayout<BuildingDesc>
            title="Buildings"
            items={buildingDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
