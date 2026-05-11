import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {AchievementDefs} from "~/lib/table-defs/achievement-table";

export default function Achievements() {
    return (
        <TableLayout<AchievementDesc>
            title="Achievements"
            items={BitCraftTables.AchievementDesc.get}
            colDefs={AchievementDefs}
        />
    );
}
