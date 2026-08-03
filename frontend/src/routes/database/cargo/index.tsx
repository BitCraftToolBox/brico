import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {CargoDescDefs} from "~/lib/table-defs/cargo-table";


export default function Cargo() {
    return (
        <TableLayout<CargoDesc>
            title={PAGE_TITLE_LABELS["/database/cargo"]}
            items={BitCraftTables.CargoDesc.get}
            colDefs={CargoDescDefs}
        />
    )
}
