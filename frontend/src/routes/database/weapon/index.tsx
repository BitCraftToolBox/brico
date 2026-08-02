import {WeaponDesc} from "~/bindings/src/weapon_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {WeaponDefs} from "~/lib/table-defs/weapon-table";

export default function Weapons() {
    return (
        <TableLayout<WeaponDesc>
            title={PAGE_TITLE_LABELS["/database/weapon"]}
            idAccessor={{accessorKey: "itemId"}}
            items={BitCraftTables.WeaponDesc.get}
            colDefs={WeaponDefs}
        />
    );
}
