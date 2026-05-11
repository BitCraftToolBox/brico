import {BuffDesc} from "~/bindings/src/buff_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {BuffDefs} from "~/lib/table-defs/buffs-table";

export default function Buffs() {
    return (
        <TableLayout<BuffDesc>
            title="Buffs"
            items={BitCraftTables.BuffDesc.get}
            colDefs={BuffDefs}
        />
    );
}
