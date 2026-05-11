import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {QuestChainDefs} from "~/lib/table-defs/quests-table";

export default function QuestChains() {
    return (
        <TableLayout<QuestChainDesc>
            title="Quest Chains"
            items={BitCraftTables.QuestChainDesc.get}
            colDefs={QuestChainDefs}
        />
    );
}
