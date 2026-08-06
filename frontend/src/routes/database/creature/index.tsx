import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {CreatureDefs} from "~/lib/table-defs/creature-table";

export default function Creatures() {
    return (
        <TableLayout<EnemyDesc>
            title={PAGE_TITLE_LABELS["/database/creature"]}
            idAccessor={{accessorKey: "enemyType"}}
            items={BitCraftTables.EnemyDesc.get}
            colDefs={CreatureDefs}
        />
    );
}
