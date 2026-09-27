import type {BountyEntitlementTotal, LoyaltyRule} from "@brico/bindings/brico-app/types";
import type {ClaimMember} from "@brico/bindings/prism/types";
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Identity, Timestamp} from "spacetimedb";
import {resolveAutomaticBonus} from "./bounty-sink.ts";

const PAYER = new Identity(1n);
const PLAYER_ID = 500n;
const CURRENCY = "hex-coin";

// `bonusRatioNumerator`/`bonusRatioDenominator` on a real `LoyaltyRule` is a bonus-only fraction
// ALREADY (e.g. `1/40` for +2.5%), never a multiplier — the frontend converts a typed multiplier
// like `1.025` into this shape once, before ever calling `upsertLoyaltyRule` (see
// `bonusFromMultiplier`'s doc comment). These defaults deliberately use the same bonus-fraction
// shape a real row would have, not the pre-conversion multiplier, so these tests can't silently
// pass against the double-conversion bug `resolveAutomaticBonus` once had.

function claimMembershipRule(overrides: {claimEntityId?: bigint; requiredAccess?: string; currency?: string; bonusRatioNumerator?: bigint; bonusRatioDenominator?: bigint} = {}): LoyaltyRule {
    return {
        id: 1n,
        payerAccountIdentity: PAYER,
        currency: overrides.currency ?? CURRENCY,
        spec: {tag: "ClaimMembership", value: {claimEntityId: overrides.claimEntityId ?? 100n, requiredAccess: overrides.requiredAccess ?? "member"}},
        bonusRatioNumerator: overrides.bonusRatioNumerator ?? 1n, // +2.5%
        bonusRatioDenominator: overrides.bonusRatioDenominator ?? 40n,
        updatedAt: Timestamp.now(),
    };
}

function effortThresholdRule(overrides: {allCurrencies?: boolean; threshold?: bigint; currency?: string; bonusRatioNumerator?: bigint; bonusRatioDenominator?: bigint} = {}): LoyaltyRule {
    return {
        id: 2n,
        payerAccountIdentity: PAYER,
        currency: overrides.currency ?? CURRENCY,
        spec: {tag: "EffortThreshold", value: {allCurrencies: overrides.allCurrencies ?? false, threshold: overrides.threshold ?? 50000n}},
        bonusRatioNumerator: overrides.bonusRatioNumerator ?? 3n, // +1.5%
        bonusRatioDenominator: overrides.bonusRatioDenominator ?? 200n,
        updatedAt: Timestamp.now(),
    };
}

function entitlementTotal(playerId: bigint, currency: string, totalEffort: bigint): BountyEntitlementTotal {
    return {id: 0n, payerAccountIdentity: PAYER, payeePlayerId: playerId, currency, total: 0n, totalEffort, updatedAt: Timestamp.now()};
}

function member(overrides: Partial<Omit<ClaimMember, "entityId" | "regionId" | "claimEntityId" | "playerEntityId">> = {}): ClaimMember {
    return {
        entityId: 0n, regionId: 0, claimEntityId: 100n, playerEntityId: PLAYER_ID,
        build: false, inventory: false, officer: false, coOwner: false, owner: false,
        ...overrides,
    };
}

describe("resolveAutomaticBonus", () => {
    it("is zero with no rules", () => {
        assert.deepEqual(resolveAutomaticBonus([], new Map(), new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 0n, denominator: 1n});
    });

    it("applies a claim-membership rule's bonus when the required flag is held", () => {
        const rules = [claimMembershipRule({requiredAccess: "officer"})];
        const claimMembers = new Map([["100:500", member({officer: true})]]);
        assert.deepEqual(resolveAutomaticBonus(rules, claimMembers, new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 1n, denominator: 40n}); // +2.5%
    });

    it("regression: returns a stored bonus fraction as-is, never re-applying bonusFromMultiplier to it", () => {
        // A real `loyalty_rule` row's bonusRatioNumerator/Denominator is already a bonus-only
        // fraction (see the module comment above). Re-converting it here (the original bug) turns
        // a stored `1/40` (+2.5%) into `(1-40)/40 = -97.5%` — exactly the wildly negative resolved
        // totals reported against a real instance.
        const rules = [claimMembershipRule({requiredAccess: "member", bonusRatioNumerator: 1n, bonusRatioDenominator: 40n})];
        const claimMembers = new Map([["100:500", member()]]);
        const bonus = resolveAutomaticBonus(rules, claimMembers, new Map(), PAYER, PLAYER_ID, CURRENCY);
        assert.ok(bonus.numerator >= 0n, "a valid rule's resolved bonus must never be negative");
        assert.deepEqual(bonus, {numerator: 1n, denominator: 40n});
    });

    it("does not apply a claim-membership rule when the contributor holds no row at all", () => {
        const rules = [claimMembershipRule({requiredAccess: "member"})];
        assert.deepEqual(resolveAutomaticBonus(rules, new Map(), new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 0n, denominator: 1n});
    });

    it("'member' matches a row that exists with every permission flag clear", () => {
        const rules = [claimMembershipRule({requiredAccess: "member"})];
        const claimMembers = new Map([["100:500", member()]]);
        assert.deepEqual(resolveAutomaticBonus(rules, claimMembers, new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 1n, denominator: 40n});
    });

    it("does not apply a claim-membership rule when the row exists but lacks the required flag", () => {
        const rules = [claimMembershipRule({requiredAccess: "officer"})];
        const claimMembers = new Map([["100:500", member({build: true})]]);
        assert.deepEqual(resolveAutomaticBonus(rules, claimMembers, new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 0n, denominator: 1n});
    });

    it("applies an effort-threshold rule once the same-currency total meets the threshold", () => {
        const rules = [effortThresholdRule({threshold: 50000n})];
        const totals = new Map([[`${PAYER.toHexString()}:${PLAYER_ID}:${CURRENCY}`, entitlementTotal(PLAYER_ID, CURRENCY, 60000n)]]);
        assert.deepEqual(resolveAutomaticBonus(rules, new Map(), totals, PAYER, PLAYER_ID, CURRENCY), {numerator: 3n, denominator: 200n}); // +1.5%
    });

    it("does not apply an effort-threshold rule below the threshold", () => {
        const rules = [effortThresholdRule({threshold: 50000n})];
        const totals = new Map([[`${PAYER.toHexString()}:${PLAYER_ID}:${CURRENCY}`, entitlementTotal(PLAYER_ID, CURRENCY, 40000n)]]);
        assert.deepEqual(resolveAutomaticBonus(rules, new Map(), totals, PAYER, PLAYER_ID, CURRENCY), {numerator: 0n, denominator: 1n});
    });

    it("sums effort across every currency when allCurrencies is set", () => {
        const rules = [effortThresholdRule({threshold: 50000n, allCurrencies: true})];
        const totals = new Map([
            [`${PAYER.toHexString()}:${PLAYER_ID}:hex-coin`, entitlementTotal(PLAYER_ID, "hex-coin", 30000n)],
            [`${PAYER.toHexString()}:${PLAYER_ID}:other-coin`, entitlementTotal(PLAYER_ID, "other-coin", 25000n)],
        ]);
        // Neither currency alone clears 50000, but the sum (55000) does.
        assert.deepEqual(resolveAutomaticBonus(rules, new Map(), totals, PAYER, PLAYER_ID, CURRENCY), {numerator: 3n, denominator: 200n});
    });

    it("ignores a rule for a different currency than the one being resolved", () => {
        const rules = [claimMembershipRule({currency: "other-coin", requiredAccess: "member"})];
        const claimMembers = new Map([["100:500", member()]]);
        assert.deepEqual(resolveAutomaticBonus(rules, claimMembers, new Map(), PAYER, PLAYER_ID, CURRENCY), {numerator: 0n, denominator: 1n});
    });

    it("stacks several satisfied rules additively, not compounding", () => {
        // +2.5% (claim) + 1.5% (50k tier) + 2% (1M tier) = +6%
        const rules = [
            claimMembershipRule({requiredAccess: "officer", bonusRatioNumerator: 1n, bonusRatioDenominator: 40n}),
            effortThresholdRule({threshold: 50000n, bonusRatioNumerator: 3n, bonusRatioDenominator: 200n}),
            effortThresholdRule({threshold: 1000000n, bonusRatioNumerator: 1n, bonusRatioDenominator: 50n}),
        ];
        const claimMembers = new Map([["100:500", member({officer: true})]]);
        const totals = new Map([[`${PAYER.toHexString()}:${PLAYER_ID}:${CURRENCY}`, entitlementTotal(PLAYER_ID, CURRENCY, 1500000n)]]);
        assert.deepEqual(resolveAutomaticBonus(rules, claimMembers, totals, PAYER, PLAYER_ID, CURRENCY), {numerator: 3n, denominator: 50n}); // +6%
    });
});
