import {BitCraftTables} from "~/lib/spacetime";
import TableLayout from "~/components/TableLayout";
import {CargoDesc} from "~/bindings/ts";
import {CargoDescDefs} from "~/lib/table-defs/cargodesc-table";


export default function Cargo() {
    const cargoDescList = BitCraftTables.CargoDesc;
    const defs = CargoDescDefs;

    return (
        <TableLayout<CargoDesc>
            title="Cargo"
            items={cargoDescList.get}
            cols={defs.columns}
            facetedFilters={defs.facetedFilters}
            searchColumn={"Name"}
        >
        </TableLayout>
    )
}
