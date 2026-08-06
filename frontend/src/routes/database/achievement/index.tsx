import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
