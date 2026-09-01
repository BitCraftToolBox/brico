import {AbilityCustomDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {AbilityDefs} from "~/lib/table-defs/abilities-table";

export default function Abilities() {
    return (
        <TableLayout<AbilityCustomDesc>
            title={PAGE_TITLE_LABELS["/database/ability"]}
            items={BitCraftTables.AbilityCustomDesc.get}
            colDefs={AbilityDefs}
        />
    );
}
