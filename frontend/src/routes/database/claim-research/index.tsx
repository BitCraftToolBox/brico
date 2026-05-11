import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {ClaimResearchDefs} from "~/lib/table-defs/claim-research-table";

export default function ClaimResearch() {
    return (
        <TableLayout<ClaimTechDesc>
            title="Claim Research"
            items={BitCraftTables.ClaimTechDesc.get}
            colDefs={ClaimResearchDefs}
        />
    );
}
