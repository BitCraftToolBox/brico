import {SkillDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
