import {PillarShapingDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {PillarShapingDefs} from "~/lib/table-defs/pillar-shaping-table";

export default function PillarShaping() {
    return (
        <TableLayout<PillarShapingDesc>
            title={PAGE_TITLE_LABELS["/database/pillar-shaping"]}
            items={BitCraftTables.PillarShapingDesc.get}
            colDefs={PillarShapingDefs}
        />
    );
}
