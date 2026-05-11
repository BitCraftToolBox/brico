import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {CreatureDefs} from "~/lib/table-defs/creature-table";

export default function Creatures() {
    return (
        <TableLayout<EnemyDesc>
            title="Creatures"
            items={BitCraftTables.EnemyDesc.get}
            colDefs={CreatureDefs}
        />
    );
}
