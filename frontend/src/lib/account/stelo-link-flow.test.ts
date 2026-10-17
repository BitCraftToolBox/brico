import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {checkSteloAddress, countNaming, groupWalletsByCurrency, linkKey, linkOutcome, pendingReasonKey} from "./stelo-link-flow.ts";

describe("checkSteloAddress", () => {
    // stelo itself is extremely lax about addresses. since they can be admin-renamed, most strings are valid
    // the main entry potential validator is the account search procedure which we use to match
    it("treats empty as neutral, normalizes valid input and flags the rest", () => {
        assert.deepEqual(checkSteloAddress("  "), {state: "empty"});
        assert.deepEqual(checkSteloAddress("#abc"), {state: "valid", address: "ABC"});
        assert.deepEqual(checkSteloAddress("##12"), {state: "valid", address: "#12"});
    });
});

describe("pendingReasonKey", () => {
    it("maps known reasons, no reason and unknown reasons", () => {
        assert.equal(pendingReasonKey(undefined), "checking");
        assert.equal(pendingReasonKey("ambiguous-address"), "ambiguous-address");
        assert.equal(pendingReasonKey("no-owner-admin-match"), "no-owner-admin-match");
        assert.equal(pendingReasonKey("something-new"), "unknown");
    });
});

describe("groupWalletsByCurrency", () => {
    it("groups in first-seen order and flags a group with no receiving wallet", () => {
        const groups = groupWalletsByCurrency([
            {currency: "a", isReceiving: false}, {currency: "b", isReceiving: true}, {currency: "a", isReceiving: false},
        ]);
        assert.deepEqual(groups.map(g => [g.currency, g.wallets.length, g.hasReceiving]), [["a", 2, false], ["b", 1, true]]);
    });
});

describe("linkOutcome", () => {
    const none = new Set<string>();
    const one = new Set([linkKey({id: 1n})]);
    it("reports success only when a new or renamed link appeared as the request vanished", () => {
        assert.equal(linkOutcome({wasWaiting: true, isWaiting: true, alreadyLinked: false, linkKeysBefore: none, linkKeysNow: none}), "waiting");
        assert.equal(linkOutcome({wasWaiting: false, isWaiting: false, alreadyLinked: false, linkKeysBefore: none, linkKeysNow: one}), "idle");
        assert.equal(linkOutcome({wasWaiting: true, isWaiting: false, alreadyLinked: false, linkKeysBefore: none, linkKeysNow: one}), "success");
        assert.equal(linkOutcome({
            wasWaiting: true, isWaiting: false, alreadyLinked: false,
            linkKeysBefore: new Set([linkKey({id: 1n, externalHandle: "#OLD"})]), linkKeysNow: new Set([linkKey({id: 1n, externalHandle: "#NEW"})]),
        }), "success");
        assert.equal(linkOutcome({wasWaiting: true, isWaiting: false, alreadyLinked: false, linkKeysBefore: one, linkKeysNow: one}), "timeout");
        assert.equal(linkOutcome({wasWaiting: true, isWaiting: false, alreadyLinked: true, linkKeysBefore: one, linkKeysNow: one}), "already-linked");
    });
});

describe("countNaming", () => {
    it("counts matching ids", () => {
        assert.equal(countNaming([1n, undefined, 2n, 1n], 1n), 2);
    });
});
