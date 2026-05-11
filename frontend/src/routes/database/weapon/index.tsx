import {WeaponDesc} from "~/bindings/src/weapon_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {WeaponDefs} from "~/lib/table-defs/weapon-table";

export default function Weapons() {
    return (
        <TableLayout<WeaponDesc>
            title="Weapons"
            items={BitCraftTables.WeaponDesc.get}
            colDefs={WeaponDefs}
        />
    );
}
