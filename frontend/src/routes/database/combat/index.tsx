import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {CombatDefs} from "~/lib/table-defs/combat-table";

export default function Combat() {
    return (
        <TableLayout<CombatActionDesc>
            title="Combat Actions"
            items={BitCraftTables.CombatActionDesc.get}
            colDefs={CombatDefs}
        />
    );
}
