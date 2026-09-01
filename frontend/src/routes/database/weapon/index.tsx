import {WeaponDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
