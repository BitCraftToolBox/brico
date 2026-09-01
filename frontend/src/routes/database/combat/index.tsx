import {CombatActionDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {CombatDefs} from "~/lib/table-defs/combat-table";

export default function Combat() {
    return (
        <TableLayout<CombatActionDesc>
            title={PAGE_TITLE_LABELS["/database/combat"]}
            items={BitCraftTables.CombatActionDesc.get}
            colDefs={CombatDefs}
        />
    );
}
