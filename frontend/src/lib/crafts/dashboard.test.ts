import assert from "node:assert/strict";
import {test} from "node:test";
import {bountyFactsFrom, parseDashboard, payeeRowsFrom, readDashboardKey} from "./dashboard.ts";

test("the key is read from the hash only", () => {
    assert.equal(readDashboardKey("#key=brico_abc"), "brico_abc");
    assert.equal(readDashboardKey("#other=1&key=brico_abc"), "brico_abc");
    assert.equal(readDashboardKey(""), null);
    assert.equal(readDashboardKey("#key="), null);
});

const feed = {
    payees: [
        {payeePlayerId: "7", payeeName: null, currency: "hex-coin", effortTotal: "100", earnedTotal: "5", paidTotal: "2"},
        {payeePlayerId: "8", payeeName: "Alice", currency: "hex-coin", effortTotal: "40", earnedTotal: "2", paidTotal: "2"},
    ],
    bounties: [{craftId: "99", ratioNumerator: "1", ratioDenominator: "20", currency: "hex-coin", private: true}],
};

test("the feed's decimal strings decode to bigints", () => {
    const parsed = parseDashboard(feed);
    assert.equal(parsed.payees[0].effortTotal, 100n);
    assert.equal(parsed.payees[1].payeeName, "Alice");
    assert.deepEqual(parsed.bounties[0], {craftId: "99", ratioNumerator: 1n, ratioDenominator: 20n, currency: "hex-coin", private: true});
});

test("a feed without payees and bounties is rejected", () => {
    assert.throws(() => parseDashboard({error: "x"}));
    assert.throws(() => parseDashboard(null));
});

test("bounties are keyed by craft id, without it in the facts", () => {
    const facts = bountyFactsFrom(parseDashboard(feed).bounties);
    assert.deepEqual(facts.get("99"), {ratioNumerator: 1n, ratioDenominator: 20n, currency: "hex-coin", private: true});
});

test("a payee row is named by its account, else its player, else its id", () => {
    const rows = payeeRowsFrom(parseDashboard(feed).payees, new Map([["7", "Bob"]]));
    assert.deepEqual(rows.map(row => row.name), ["Bob", "Alice"]);
    assert.equal(payeeRowsFrom(parseDashboard(feed).payees, new Map())[0].name, "7");
});
