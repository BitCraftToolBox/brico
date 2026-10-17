import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {resolveFundingFlags} from "./funding-notify-defaults.ts";

describe("resolveFundingFlags", () => {
    it("defaults toast on and Discord off when there is no row", () => {
        assert.deepEqual(resolveFundingFlags(undefined, "toast"), {fundingFailed: true, payoutShortfall: true, unclaimed: true});
        assert.deepEqual(resolveFundingFlags(undefined, "discord"), {fundingFailed: false, payoutShortfall: false, unclaimed: false});
    });

    it("lets an explicit row, even all false, override the default", () => {
        const off = {fundingFailed: false, payoutShortfall: false, unclaimed: false};
        assert.deepEqual(resolveFundingFlags(off, "toast"), off);
        const some = {fundingFailed: true, payoutShortfall: false, unclaimed: true};
        assert.deepEqual(resolveFundingFlags(some, "discord"), some);
    });
});
