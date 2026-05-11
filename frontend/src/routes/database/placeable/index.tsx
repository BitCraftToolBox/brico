import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {PlaceableDefs} from "~/lib/table-defs/placeables-table";

export default function Placeables() {
    return (
        <TableLayout<PlaceableDesc>
            title="Placeables"
            items={BitCraftTables.PlaceableDesc.get}
            colDefs={PlaceableDefs}
        />
    );
}
