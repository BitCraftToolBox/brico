import {EquipmentDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {EquipmentDefs} from "~/lib/table-defs/equipment-table";

export default function Equipment() {
    return (
        <TableLayout<EquipmentDesc>
            title={PAGE_TITLE_LABELS["/database/equipment"]}
            idAccessor={{accessorKey: "itemId"}}
            items={BitCraftTables.EquipmentDesc.get}
            colDefs={EquipmentDefs}
        />
    );
}
