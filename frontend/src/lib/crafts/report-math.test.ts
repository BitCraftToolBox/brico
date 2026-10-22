import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {currenciesNeedingWallet, escrowSummary, filterByCurrency, payoutTime} from "./report-math.ts";

describe("payoutTime", () => {
    const schedule = {intervalMicros: 3_600_000_000n, lastSweepAtMicros: 1_000_000_000_000n};

    it("is upcoming until lastSweepAt + interval, then overdue since that moment", () => {
        const due = 1_000_000_000 + 3_600_000;
        assert.deepEqual(payoutTime(schedule, due - 1), {kind: "upcoming", atMs: due});
        assert.deepEqual(payoutTime(schedule, due), {kind: "overdue", sinceMs: due});
        assert.deepEqual(payoutTime(schedule, due + 5), {kind: "overdue", sinceMs: due});
    });
});

describe("filterByCurrency", () => {
    const rows = [{currency: "a"}, {currency: "b"}];

    it("keeps everything for an empty selection and only the selected otherwise", () => {
        assert.equal(filterByCurrency(rows, []).length, 2);
        assert.deepEqual(filterByCurrency(rows, ["b"]), [{currency: "b"}]);
    });
});

describe("escrowSummary", () => {
    it("sums held minus released and refund due per currency", () => {
        const summary = escrowSummary(
            [{currency: "s", heldAmount: 10n, releasedAmount: 3n}, {currency: "s", heldAmount: 5n, releasedAmount: 0n}],
            [{currency: "s", refundDue: 4n}, {currency: "t", refundDue: 1n}],
        );
        assert.deepEqual(summary.get("s"), {held: 12n, refundDue: 4n});
        assert.deepEqual(summary.get("t"), {held: 0n, refundDue: 1n});
    });
});

describe("currenciesNeedingWallet", () => {
    const rows = [
        {currency: "s", earnedTotal: 5n, paidTotal: 2n},
        {currency: "s", earnedTotal: 1n, paidTotal: 1n},
        {currency: "h", earnedTotal: 9n, paidTotal: 0n},
    ];

    it("flags only escrowed currencies with an unpaid balance and no receiving wallet", () => {
        assert.deepEqual(currenciesNeedingWallet(rows, c => c === "s", () => false), ["s"]);
        assert.deepEqual(currenciesNeedingWallet(rows, c => c === "s", () => true), []);
    });
});
