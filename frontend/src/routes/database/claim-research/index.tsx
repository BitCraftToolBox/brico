import {ClaimTechDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {ClaimResearchDefs} from "~/lib/table-defs/claim-research-table";

export default function ClaimResearch() {
    return (
        <TableLayout<ClaimTechDesc>
            title={PAGE_TITLE_LABELS["/database/claim-research"]}
            items={BitCraftTables.ClaimTechDesc.get}
            colDefs={ClaimResearchDefs}
        />
    );
}
