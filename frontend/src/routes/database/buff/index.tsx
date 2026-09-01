import {BuffDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
