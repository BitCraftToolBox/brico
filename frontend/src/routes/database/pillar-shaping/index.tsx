import {PillarShapingDesc} from "~/bindings/src/pillar_shaping_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
