import assert from "node:assert/strict";
import {test} from "node:test";
import {countByStatus, type FundingFacts, myBountyRows} from "./my-bounties.ts";

const assignment = (craftId: bigint, currency = "hex-coin") => ({craftId, numerator: 1n, denominator: 20n, currency, private: false});
const funding = (craftId: bigint, state: string, extra: Partial<FundingFacts> = {}): FundingFacts => ({
    craftId, currency: "stelo-hex-coin", state, reason: undefined, source: "rule", ruleId: "r", fundingLinkId: 1n,
    ratioNumerator: 1n, ratioDenominator: 20n, ...extra,
});
const none = {assignments: [], overrides: [], funding: [], escrows: new Map()};

test("a trust-currency assignment is a plain assigned row, sourced from the override when one exists", () => {
    const rows = myBountyRows({...none, assignments: [assignment(1n), assignment(2n)], overrides: [assignment(2n)]});
    assert.deepEqual(rows.map(row => [row.craftId, row.status, row.source]), [[2n, "assigned", "override"], [1n, "assigned", "rule"]]);
});

test("an escrowed craft takes its status and wallet from the funding row, and its hold from the escrow", () => {
    const rows = myBountyRows({
        ...none,
        assignments: [assignment(3n, "stelo-hex-coin")],
        funding: [funding(3n, "funded")],
        escrows: new Map([[3n, {heldAmount: 20n, releasedAmount: 5n}]]),
    });
    assert.equal(rows[0].status, "funded");
    assert.equal(rows[0].spendable, 15n);
    assert.equal(rows[0].fundingLinkId, 1n);
});

test("an override with no assignment or funding row yet is pending at its own rate", () => {
    const rows = myBountyRows({...none, overrides: [assignment(4n)]});
    assert.deepEqual([rows[0].status, rows[0].assigned, rows[0].intended], ["pending", null, {numerator: 1n, denominator: 20n}]);
});

test("a funding row alone (nothing assigned) keeps the intended rate and the failure reason", () => {
    const rows = myBountyRows({...none, funding: [funding(5n, "failed", {reason: "insufficient-funds"})]});
    assert.deepEqual([rows[0].status, rows[0].reason, rows[0].assigned], ["failed", "insufficient-funds", null]);
});

test("rows sort failures first, then by newest craft, and statuses are counted", () => {
    const rows = myBountyRows({
        ...none,
        assignments: [assignment(1n), assignment(9n, "stelo-hex-coin")],
        funding: [funding(9n, "funded"), funding(2n, "failed"), funding(3n, "waiting"), funding(8n, "failed")],
    });
    assert.deepEqual(rows.map(row => `${row.craftId}:${row.status}`), ["8:failed", "2:failed", "3:waiting", "9:funded", "1:assigned"]);
    assert.deepEqual([...countByStatus(rows)], [["failed", 2], ["waiting", 1], ["funded", 1], ["assigned", 1]]);
});
