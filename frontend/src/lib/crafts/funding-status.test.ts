import assert from "node:assert/strict";
import {test} from "node:test";
import {fundingStatusView} from "./funding-status.ts";

const row = {state: "waiting", reason: "cannot-pull", source: "rule", ruleId: "r", fundingLinkId: 1n, ratioNumerator: 1n, ratioDenominator: 10n};

test("no row means no escrow intent", () => {
    assert.equal(fundingStatusView(undefined, null, undefined), null);
});

test("a waiting row keeps its reason and intended rate while nothing is assigned", () => {
    const view = fundingStatusView(row, null, undefined)!;
    assert.equal(view.state, "waiting");
    assert.equal(view.reason, "cannot-pull");
    assert.deepEqual(view.intended, {numerator: 1n, denominator: 10n});
    assert.equal(view.raisingTo, undefined);
});

test("funding above the assigned rate is a raise; at or below it is not", () => {
    const funding = {...row, state: "funding", reason: undefined};
    assert.deepEqual(fundingStatusView(funding, {numerator: 1n, denominator: 20n}, undefined)!.raisingTo, {numerator: 1n, denominator: 10n});
    assert.equal(fundingStatusView(funding, {numerator: 1n, denominator: 10n}, undefined)!.raisingTo, undefined);
    assert.equal(fundingStatusView(funding, {numerator: 1n, denominator: 5n}, undefined)!.raisingTo, undefined);
});

test("funded reports held minus released, and an unknown state falls back to waiting", () => {
    assert.equal(fundingStatusView({...row, state: "funded"}, null, {heldAmount: 20n, releasedAmount: 5n})!.spendable, 15n);
    assert.equal(fundingStatusView({...row, state: "bogus", source: "override"}, null, undefined)!.state, "waiting");
    assert.equal(fundingStatusView({...row, source: "override"}, null, undefined)!.source, "override");
});
