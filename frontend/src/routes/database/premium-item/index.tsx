import {PremiumItemDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {PremiumItemDefs} from "~/lib/table-defs/premium-items-table";

export default function PremiumItems() {
    return (
        <TableLayout<PremiumItemDesc>
            title={PAGE_TITLE_LABELS["/database/premium-item"]}
            items={BitCraftTables.PremiumItemDesc.get}
            colDefs={PremiumItemDefs}
            initialState={{sorting: [{id: "Sort Priority", desc: true}]}}
        />
    );
}
