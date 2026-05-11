import {SkillDesc} from "~/bindings/src/skill_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {SkillDefs} from "~/lib/table-defs/skills-table";

export default function Skills() {
    return (
        <TableLayout<SkillDesc>
            title="Skills"
            items={BitCraftTables.SkillDesc.get}
            colDefs={SkillDefs}
        />
    );
}
