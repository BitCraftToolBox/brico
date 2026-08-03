import {SkillDesc} from "~/bindings/src/skill_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {SkillDefs} from "~/lib/table-defs/skills-table";

export default function Skills() {
    return (
        <TableLayout<SkillDesc>
            title={PAGE_TITLE_LABELS["/database/skill"]}
            items={BitCraftTables.SkillDesc.get}
            colDefs={SkillDefs}
        />
    );
}
