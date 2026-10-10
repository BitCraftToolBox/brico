import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {describeFundingReason, FUNDING_REASONS, normalizeSteloAddress, renderFundingTemplate} from "./stelo.ts";

describe("normalizeSteloAddress", () => {
    it("strips one leading # and upper-cases", () => {
        assert.equal(normalizeSteloAddress("#abcd"), "ABCD");
        assert.equal(normalizeSteloAddress("  Zq "), "ZQ");
    });

    it("rejects input that is empty once trimmed and de-hashed", () => {
        for (const bad of ["", "   ", "#", " # "]) assert.equal(normalizeSteloAddress(bad), null, bad);
    });

    it("accepts custom addresses", () => {
        assert.equal(normalizeSteloAddress("#payer001"), "PAYER001");
        assert.equal(normalizeSteloAddress("a-b_c"), "A-B_C");
        assert.equal(normalizeSteloAddress("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        assert.equal(normalizeSteloAddress("##AB"), "#AB");
    });
});

describe("renderFundingTemplate", () => {
    it("fills known tokens, renders the reason in English and keeps unknown tokens", () => {
        const text = renderFundingTemplate("{mention}{craft} {reason} {bounties} {nope}", {
            currency: "X", amount: null, craft: "[c](<u>)", bounties: "[b](<u>)", wallet: "#A", reason: "cannot-pull", mentionText: null,
        });
        assert.equal(text, "[c](<u>) Brico.app needs Write access on the funding wallet [b](<u>) {nope}");
    });

    it("has clause-style English for every reason code and the unclaimed outcomes", () => {
        for (const code of FUNDING_REASONS) {
            const text = describeFundingReason(code);
            assert.notEqual(text, code, `${code} has no wording`);
            assert.match(text, /^[a-zA-Z]/);
            assert.doesNotMatch(text, /\.$/, `${code} wording must not end in a period`);
        }
        assert.equal(describeFundingReason("rolled-over"), "rolled over");
        assert.equal(describeFundingReason("mystery"), "mystery");
    });
});
