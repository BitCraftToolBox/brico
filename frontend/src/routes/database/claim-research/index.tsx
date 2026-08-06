import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import TableLayout from "~/components/TableLayout";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
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
