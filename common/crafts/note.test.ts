import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {normalizePayoutNote, PAYOUT_NOTE_MAX_BYTES} from "./note.ts";

describe("normalizePayoutNote", () => {
    it("trims", () => assert.equal(normalizePayoutNote("  hi "), "hi"));
    it("rejects empty and control characters", () => {
        assert.equal(normalizePayoutNote("   "), null);
        assert.equal(normalizePayoutNote("a\nb"), null);
    });
    it("limits by UTF-8 bytes", () => {
        assert.equal(normalizePayoutNote("a".repeat(PAYOUT_NOTE_MAX_BYTES)), "a".repeat(PAYOUT_NOTE_MAX_BYTES));
        assert.equal(normalizePayoutNote("é".repeat(PAYOUT_NOTE_MAX_BYTES / 2 + 1)), null);
    });
});
