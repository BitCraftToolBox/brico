import {CargoDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
