import {BuffDesc} from "~/bindings/src/buff_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {BuffDefs} from "~/lib/table-defs/buffs-table";

export default function Buffs() {
    return (
        <TableLayout<BuffDesc>
            title={PAGE_TITLE_LABELS["/database/buff"]}
            items={BitCraftTables.BuffDesc.get}
            colDefs={BuffDefs}
        />
    );
}
