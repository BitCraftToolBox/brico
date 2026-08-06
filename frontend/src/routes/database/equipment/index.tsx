import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
