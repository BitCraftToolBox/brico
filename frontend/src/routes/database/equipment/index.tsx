import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {EquipmentDefs} from "~/lib/table-defs/equipment-table";

export default function Equipment() {
    return (
        <TableLayout<EquipmentDesc>
            title="Equipment"
            items={BitCraftTables.EquipmentDesc.get}
            colDefs={EquipmentDefs}
        />
    );
}
