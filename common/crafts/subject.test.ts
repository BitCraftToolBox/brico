import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {buildCraftSubject, type CraftFacts, craftTier, optionalId, ownerClaimAccessFor, type RecipeStatic} from "./subject.ts";

function facts(overrides: Partial<CraftFacts> = {}): CraftFacts {
    return {
        regionId: 14,
        claimEntityId: 100n,
        ownerEntityId: 200n,
        count: 2,
        public: true,
        progressRaw: 0,
        ...overrides,
    };
}

const RECIPE: RecipeStatic = {
    effortRequired: 100,
    skillId: 3,
    buildingType: 127749503,
    levelRequired: 25,
    itemKey: "item:1150001",
    itemTag: "Basic Food",
    inputItems: [{key: "item:1150002", tag: "Ingredients"}, {key: "cargo:5", tag: "Ingredients"}],
};

describe("optionalId", () => {
    it("maps the relay's absent marker to null", () => {
        assert.equal(optionalId(0n), null);
    });

    it("stringifies a real id without precision loss", () => {
        assert.equal(optionalId(360287970189639681n), "360287970189639681");
    });
});

describe("craftTier", () => {
    it("floors every ten levels into one tier", () => {
        assert.equal(craftTier(0), 1);
        assert.equal(craftTier(9), 1);
        assert.equal(craftTier(10), 1);
        assert.equal(craftTier(25), 2);
        assert.equal(craftTier(99), 9);
    });
});

describe("ownerClaimAccessFor", () => {
    it("is null when there is no claim or no owner to check", () => {
        assert.equal(ownerClaimAccessFor(0n, 200n, undefined), null);
        assert.equal(ownerClaimAccessFor(100n, 0n, undefined), null);
    });

    it("is an empty array when both exist but the owner holds no claim_member row", () => {
        assert.deepEqual(ownerClaimAccessFor(100n, 200n, undefined), []);
    });

    it("always includes member, plus one flag per set permission", () => {
        assert.deepEqual(
            ownerClaimAccessFor(100n, 200n, {build: true, inventory: false, officer: true, coOwner: false, owner: false}),
            ["member", "build", "officer"],
        );
    });
});

describe("buildCraftSubject", () => {
    it("multiplies per-unit effort by count, and derives tier from the recipe's level requirement", () => {
        const subject = buildCraftSubject(facts({count: 2}), RECIPE, undefined);
        assert.equal(subject.effortTotal, 200);
        assert.equal(subject.tier, 2);
        assert.equal(subject.item, "item:1150001");
        assert.equal(subject.itemTag, "Basic Food");
        assert.deepEqual(subject.inputItems, RECIPE.inputItems);
        assert.equal(subject.skill, 3);
    });

    it("clamps progress to the total and is complete only once remaining hits zero", () => {
        const partial = buildCraftSubject(facts({count: 2, progressRaw: 150}), RECIPE, undefined);
        assert.equal(partial.effortRemaining, 50);
        assert.equal(partial.complete, false);

        const overshot = buildCraftSubject(facts({count: 2, progressRaw: 999}), RECIPE, undefined);
        assert.equal(overshot.effortRemaining, 0);
        assert.equal(overshot.complete, true);
    });

    it("is never complete with an unknown recipe, since effortTotal is 0", () => {
        const subject = buildCraftSubject(facts(), undefined, undefined);
        assert.equal(subject.effortTotal, 0);
        assert.equal(subject.tier, null);
        assert.equal(subject.complete, false);
        assert.equal(subject.itemTag, null);
        assert.deepEqual(subject.inputItems, []);
    });

    it("carries claim/owner ids and access through to the subject", () => {
        const subject = buildCraftSubject(
            facts({claimEntityId: 100n, ownerEntityId: 200n}),
            RECIPE,
            {build: true, inventory: false, officer: false, coOwner: false, owner: false},
        );
        assert.equal(subject.claim, "100");
        assert.equal(subject.owner, "200");
        assert.deepEqual(subject.ownerClaimAccess, ["member", "build"]);
    });

    it("has no payout/currency without a resolved bounty", () => {
        const subject = buildCraftSubject(facts(), RECIPE, undefined);
        assert.equal(subject.payout, null);
        assert.equal(subject.currency, null);
    });

    it("resolves payout as a float approximation of the bounty's exact ratio", () => {
        const subject = buildCraftSubject(facts(), RECIPE, undefined, {
            ratioNumerator: 1n,
            ratioDenominator: 20n,
            currency: "hex-coin",
            private: false,
        });
        assert.equal(subject.payout, 0.05);
        assert.equal(subject.currency, "hex-coin");
        assert.equal(subject.bountyPrivate, false);
    });

    it("carries a private bounty's flag through to bountyPrivate", () => {
        const subject = buildCraftSubject(facts(), RECIPE, undefined, {
            ratioNumerator: 1n,
            ratioDenominator: 20n,
            currency: "hex-coin",
            private: true,
        });
        assert.equal(subject.bountyPrivate, true);
    });

    it("is not private without a resolved bounty", () => {
        const subject = buildCraftSubject(facts(), RECIPE, undefined);
        assert.equal(subject.bountyPrivate, false);
    });
});
