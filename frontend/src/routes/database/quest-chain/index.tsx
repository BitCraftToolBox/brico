import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
