import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {computeEntitlement, parseDecimalRatio, reduceRatio} from "./entitlement.ts";

describe("computeEntitlement", () => {
    it("matches the worked example: ratio 1 Hex Coin per 20 effort", () => {
        // docs/craft-manager-phase-3-bounties-payouts.md's confirmed worked example.
        assert.equal(computeEntitlement(130n, 1n, 20n), 6n);
        assert.equal(computeEntitlement(90n, 1n, 20n), 4n);
        assert.equal(computeEntitlement(80n, 1n, 20n), 4n);
        // Sum of individually-floored entitlements (14) never exceeds the ideal total floored off
        // combined effort (floor(300/20) = 15) — the structural no-overpayment guarantee.
        const sum = computeEntitlement(130n, 1n, 20n) + computeEntitlement(90n, 1n, 20n) + computeEntitlement(80n, 1n, 20n);
        assert.equal(sum, 14n);
        assert.ok(sum <= computeEntitlement(300n, 1n, 20n));
    });

    it("pays only the delta on top of an already-recorded entitlement, as more effort comes in", () => {
        // Alice: 130 -> 140 effort. Bob unchanged at 90. Carol: 80 -> 100 effort.
        const alicePrev = computeEntitlement(130n, 1n, 20n);
        const aliceNow = computeEntitlement(140n, 1n, 20n);
        assert.equal(aliceNow - alicePrev, 1n);

        const bobPrev = computeEntitlement(90n, 1n, 20n);
        const bobNow = computeEntitlement(90n, 1n, 20n);
        assert.equal(bobNow - bobPrev, 0n);

        const carolPrev = computeEntitlement(80n, 1n, 20n);
        const carolNow = computeEntitlement(100n, 1n, 20n);
        assert.equal(carolNow - carolPrev, 1n);
    });

    it("floors exactly at a multiple of the ratio, with no remainder", () => {
        assert.equal(computeEntitlement(100n, 1n, 20n), 5n);
        assert.equal(computeEntitlement(99n, 1n, 20n), 4n);
        assert.equal(computeEntitlement(101n, 1n, 20n), 5n);
    });

    it("is exact for large effort/ratio values a float would round", () => {
        // Number.MAX_SAFE_INTEGER is 2^53 - 1; a naive `Number()` cast here would lose precision.
        const hugeEffort = 9_007_199_254_740_993n; // 2^53 + 1
        assert.equal(computeEntitlement(hugeEffort, 1n, 1n), hugeEffort);
        assert.equal(computeEntitlement(hugeEffort, 3n, 3n), hugeEffort);
    });

    it("is zero for zero effort", () => {
        assert.equal(computeEntitlement(0n, 1n, 20n), 0n);
    });
});

describe("reduceRatio", () => {
    it("reduces by gcd", () => {
        assert.deepEqual(reduceRatio(40n, 100n), {numerator: 2n, denominator: 5n});
    });

    it("reduces zero to 0/1", () => {
        assert.deepEqual(reduceRatio(0n, 20n), {numerator: 0n, denominator: 1n});
    });

    it("leaves an already-reduced fraction alone", () => {
        assert.deepEqual(reduceRatio(1n, 20n), {numerator: 1n, denominator: 20n});
    });
});

describe("parseDecimalRatio", () => {
    it("parses a simple decimal into a reduced fraction", () => {
        assert.deepEqual(parseDecimalRatio("0.4"), {numerator: 2n, denominator: 5n});
    });

    it("reduces trailing zeros to the same fraction as without them", () => {
        assert.deepEqual(parseDecimalRatio("0.40"), parseDecimalRatio("0.4"));
    });

    it("parses a whole number with no decimal point", () => {
        assert.deepEqual(parseDecimalRatio("5"), {numerator: 5n, denominator: 1n});
    });

    it("parses zero", () => {
        assert.deepEqual(parseDecimalRatio("0"), {numerator: 0n, denominator: 1n});
        assert.deepEqual(parseDecimalRatio("0.0"), {numerator: 0n, denominator: 1n});
    });

    it("parses a multi-digit fraction exactly, never through a float round-trip", () => {
        // 0.1 + 0.2 famously isn't 0.3 in floating point; this must not go anywhere near that path.
        assert.deepEqual(parseDecimalRatio("0.123456789"), {numerator: 123456789n, denominator: 1000000000n});
    });

    it("parses a leading-dot decimal the same as its explicit-zero spelling", () => {
        assert.deepEqual(parseDecimalRatio(".5"), parseDecimalRatio("0.5"));
        assert.deepEqual(parseDecimalRatio(".25"), {numerator: 1n, denominator: 4n});
    });

    it("rejects malformed input", () => {
        assert.equal(parseDecimalRatio(""), null);
        assert.equal(parseDecimalRatio("."), null);
        assert.equal(parseDecimalRatio("5."), null);
        assert.equal(parseDecimalRatio("1.2.3"), null);
        assert.equal(parseDecimalRatio("-1"), null);
        assert.equal(parseDecimalRatio("abc"), null);
        assert.equal(parseDecimalRatio("1,5"), null);
    });
});
