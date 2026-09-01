import {SecondaryKnowledgeDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
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
