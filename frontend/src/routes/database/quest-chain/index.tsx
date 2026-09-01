import {QuestChainDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {QuestChainDefs} from "~/lib/table-defs/quests-table";

export default function QuestChains() {
    return (
        <TableLayout<QuestChainDesc>
            title={PAGE_TITLE_LABELS["/database/quest-chain"]}
            items={BitCraftTables.QuestChainDesc.get}
            colDefs={QuestChainDefs}
        />
    );
}
