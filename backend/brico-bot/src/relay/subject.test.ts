/**
 * subject.test.ts — how resolved bounties are layered onto already-built craft rows.
 */
import assert from "node:assert/strict";
import {test} from "node:test";

import {applyBounties, type AssignedBounty, type CraftRow, rowFor} from "./subject.ts";

function row(entityId: bigint): CraftRow {
    return {
        id: entityId.toString(),
        entityId,
        claimEntityId: 0n,
        ownerEntityId: 0n,
        regionId: 1,
        regionName: "r",
        recipeId: 1,
        count: 1,
        claimName: null,
        ownerName: null,
        firstSeenMs: 0n,
        subject: {
            region: 1, claim: null, item: null, itemTag: null, inputItems: [], skill: null, tier: null, buildingType: null,
            effortTotal: 10, effortRemaining: 10, public: true, complete: false, owner: null, ownerClaimAccess: null,
            payout: null, currency: null, bountyPrivate: false,
        },
        privateBountyOwner: null,
        publicView: null,
    };
}

const bounty = (isPrivate: boolean): AssignedBounty => ({
    ratioNumerator: 1n, ratioDenominator: 4n, currency: "hex-coin", private: isPrivate,
    assignedByAccountIdentity: {toHexString: () => "assigner"},
});

test("applyBounties leaves unbountied rows untouched and returns the same array when there are no bounties", () => {
    const rows = [row(1n), row(2n)];
    assert.equal(applyBounties(rows, new Map()), rows);
    const applied = applyBounties(rows, new Map([[2n, bounty(false)]]));
    assert.equal(applied[0], rows[0]);
    assert.equal(applied[1].subject.payout, 0.25);
    assert.equal(applied[1].subject.currency, "hex-coin");
    assert.equal(applied[1].publicView, null);
    assert.equal(rows[1].subject.payout, null, "the input row is not mutated");
});

test("a private bounty gets a public view equal to the unbountied row, visible only to its assigner", () => {
    const rows = [row(1n)];
    const [applied] = applyBounties(rows, new Map([[1n, bounty(true)]]));
    assert.equal(applied.subject.bountyPrivate, true);
    assert.equal(applied.privateBountyOwner, "assigner");
    assert.equal(rowFor(applied, "assigner"), applied);
    assert.equal(rowFor(applied, "someone-else"), rows[0]);
    assert.equal(rowFor(applied, null).subject.payout, null);
});
