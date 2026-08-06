import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
