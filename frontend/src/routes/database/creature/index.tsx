import {EnemyDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
