/**
 * subject.ts — projects relay rows into the `CraftRow` the bridge logs and matches watches against.
 *
 * The actual `CraftSubject` math (`@brico/crafts/subject`'s `buildCraftSubject`) is shared with the
 * frontend's `frontend/src/lib/crafts/entries.ts` — this file's job is just resolving *this*
 * process's inputs to it (recipe statics from `RecipeIndex`, the owner's `claim_member` row from the
 * snapshot) and adding the handful of display fields a log line needs.
 */
import type {CraftSubject} from "@brico/crafts/filter";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {buildCraftSubject, type CraftBountyFacts} from "@brico/crafts/subject";

import type {RecipeIndex} from "../game-data/recipes.ts";
import type {CraftSnapshot} from "./prism.ts";

/** A craft projected for matching, with just enough context to make a log line readable. */
export interface CraftRow {
    /** Craft entity id as a bigint string — the identity a watch's match set is keyed by, and the
     * form `id`-kind filter leaves compare against (64-bit ids overflow `number`). */
    id: string;
    regionId: number;
    regionName: string;
    recipeId: number;
    count: number;
    claimName: string | null;
    ownerName: string | null;
    /** `craft_meta.firstSeen` in millis. */
    firstSeenMs: bigint;
    subject: CraftSubject;
    /** Hex identity of the account that assigned this craft's bounty, only when that bounty is private. */
    privateBountyOwner: string | null;
    /** This row as everyone but `privateBountyOwner` sees it (bounty cleared); `null` unless the bounty is private. */
    publicView: CraftRow | null;
}

/** A resolved bounty plus the account it came from, which decides who may see it if private. */
export interface AssignedBounty extends CraftBountyFacts {
    assignedByAccountIdentity: {toHexString(): string};
}

/** The row `viewerAccountHex` may see: a private bounty is hidden from everyone but its assigner. Allocation-free. */
export function rowFor(row: CraftRow, viewerAccountHex: string | null): CraftRow {
    return row.publicView !== null && row.privateBountyOwner !== viewerAccountHex ? row.publicView : row;
}

export function craftRowsFrom(
    snapshot: CraftSnapshot,
    recipes: RecipeIndex,
    assignments?: ReadonlyMap<bigint, AssignedBounty>,
): CraftRow[] {
    return snapshot.crafts.map(craft => {
        const recipe = recipes.get(craft.recipeId);
        const progress = snapshot.progress.get(craft.entityId);
        const claim = craft.claimEntityId === 0n ? undefined : snapshot.claims.get(craft.claimEntityId);
        const owner = craft.ownerEntityId === 0n ? undefined : snapshot.players.get(craft.ownerEntityId);
        const ownerClaimMember = snapshot.claimMembers.get(`${craft.claimEntityId}:${craft.ownerEntityId}`);

        const bounty = assignments?.get(craft.entityId);
        const subject = buildCraftSubject(
            {
                regionId: craft.regionId,
                claimEntityId: craft.claimEntityId,
                ownerEntityId: craft.ownerEntityId,
                count: craft.count,
                public: craft.public,
                progressRaw: progress?.progress ?? 0,
            },
            recipe,
            ownerClaimMember,
            bounty,
        );

        const row: CraftRow = {
            id: craft.entityId.toString(),
            regionId: craft.regionId,
            regionName: regionDisplayName(snapshot.regions.get(craft.regionId)?.name, craft.regionId),
            recipeId: craft.recipeId,
            count: craft.count,
            claimName: claim ? claimDisplayName(claim.name) : null,
            ownerName: owner?.name ?? null,
            firstSeenMs: craft.firstSeen.toMillis(),
            subject,
            privateBountyOwner: null,
            publicView: null,
        };
        if (bounty?.private) {
            row.privateBountyOwner = bounty.assignedByAccountIdentity.toHexString();
            row.publicView = {...row, subject: {...subject, payout: null, currency: null, bountyPrivate: false}, privateBountyOwner: null};
        }
        return row;
    });
}
