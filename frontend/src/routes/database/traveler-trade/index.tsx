import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import TableLayout from "~/components/TableLayout";
import {BitCraftTables} from "~/lib/spacetime";
import {TravelerTradeDefs} from "~/lib/table-defs/traveler-trades-table";

export default function TravelerTrades() {
    return (
        <TableLayout<TravelerTradeOrderDesc>
            title="Traveler Trades"
            items={BitCraftTables.TravelerTradeOrderDesc.get}
            colDefs={TravelerTradeDefs}
        />
    );
}

