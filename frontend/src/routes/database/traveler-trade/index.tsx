import {TravelerTradeOrderDesc} from "@brico/bitcraft-bindings/types";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {PAGE_TITLE_LABELS} from "~/lib/sidebar-items";
import {TravelerTradeDefs} from "~/lib/table-defs/traveler-trades-table";

export default function TravelerTrades() {
    return (
        <TableLayout<TravelerTradeOrderDesc>
            title={PAGE_TITLE_LABELS["/database/traveler-trade"]}
            items={BitCraftTables.TravelerTradeOrderDesc.get}
            colDefs={TravelerTradeDefs}
        />
    );
}

