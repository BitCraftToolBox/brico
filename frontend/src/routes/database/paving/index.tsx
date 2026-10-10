import {PavingTileDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
