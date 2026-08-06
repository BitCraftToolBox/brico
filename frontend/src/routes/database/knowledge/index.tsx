import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {KnowledgeDefs} from "~/lib/table-defs/knowledge-table";

export default function Knowledge() {
    return (
        <TableLayout<SecondaryKnowledgeDesc>
            title={PAGE_TITLE_LABELS["/database/knowledge"]}
            items={BitCraftTables.SecondaryKnowledgeDesc.get}
            colDefs={KnowledgeDefs}
        />
    );
}
