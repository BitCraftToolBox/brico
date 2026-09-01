import {AchievementDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {AchievementDefs} from "~/lib/table-defs/achievement-table";

export default function Achievements() {
    return (
        <TableLayout<AchievementDesc>
            title={PAGE_TITLE_LABELS["/database/achievement"]}
            items={BitCraftTables.AchievementDesc.get}
            colDefs={AchievementDefs}
        />
    );
}
