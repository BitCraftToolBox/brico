import {AbilityCustomDesc} from "~/bindings/src/ability_custom_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
