import {PlaceableDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {PlaceableDefs} from "~/lib/table-defs/placeables-table";

export default function Placeables() {
    return (
        <TableLayout<PlaceableDesc>
            title={PAGE_TITLE_LABELS["/database/placeable"]}
            items={BitCraftTables.PlaceableDesc.get}
            colDefs={PlaceableDefs}
        />
    );
}
