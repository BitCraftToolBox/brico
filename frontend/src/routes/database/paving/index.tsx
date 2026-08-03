import {PavingTileDesc} from "~/bindings/src/paving_tile_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {PavingDefs} from "~/lib/table-defs/paving-table";

export default function Paving() {
    return (
        <TableLayout<PavingTileDesc>
            title={PAGE_TITLE_LABELS["/database/paving"]}
            items={BitCraftTables.PavingTileDesc.get}
            colDefs={PavingDefs}
        />
    );
}
