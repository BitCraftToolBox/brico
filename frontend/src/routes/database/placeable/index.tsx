import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
