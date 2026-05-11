import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {CargoDescDefs} from "~/lib/table-defs/cargo-table";


export default function Cargo() {
    return (
        <TableLayout<CargoDesc>
            title="Cargo"
            items={BitCraftTables.CargoDesc.get}
            colDefs={CargoDescDefs}
        />
    )
}
