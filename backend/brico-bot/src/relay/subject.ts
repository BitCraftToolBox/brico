/**
 * subject.ts — projects relay rows into the `CraftRow` the bridge logs and matches watches against.
 *
 * The actual `CraftSubject` math (`@brico/crafts/subject`'s `buildCraftSubject`) is shared with the
 * frontend's `frontend/src/lib/crafts/entries.ts` — this file's job is just resolving *this*
 * process's inputs to it (recipe statics from `RecipeIndex`, the owner's `claim_member` row from the
 * snapshot) and adding the handful of display fields a log line needs.
 */
import type {CraftMeta} from "@brico/bindings/prism/types";
import type {CraftSubject} from "@brico/crafts/filter";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {bountyFields, buildCraftSubject, type CraftBountyFacts} from "@brico/crafts/subject";
import type {RecipeIndex} from "../game-data/recipes.ts";
import type {CraftSnapshot} from "./prism.ts";

/** A craft projected for matching, with just enough context to make a log line readable. */
export interface CraftRow {
    /** Craft entity id as a bigint string — the identity a watch's match set is keyed by, and the
     * form `id`-kind filter leaves compare against (64-bit ids overflow `number`). */
    id: string;
    /** `id` and the claim/owner ids (`0n` when absent) as bigints, so per-craft lookups don't re-parse strings. */
    entityId: bigint;
    claimEntityId: bigint;
    ownerEntityId: bigint;
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

/** The relay tables a row is joined from. */
export type RowInputs = Pick<CraftSnapshot, "progress" | "claims" | "claimMembers" | "players" | "regions">;

/** The display-only fields of a row; changing them never changes what a filter matches. */
export function displayFields(regionId: number, claimEntityId: bigint, ownerEntityId: bigint, inputs: Pick<RowInputs, "claims" | "players" | "regions">): Pick<CraftRow, "regionName" | "claimName" | "ownerName"> {
    const claim = claimEntityId === 0n ? undefined : inputs.claims.get(claimEntityId);
    const owner = ownerEntityId === 0n ? undefined : inputs.players.get(ownerEntityId);
    return {
        regionName: regionDisplayName(inputs.regions.get(regionId)?.name, regionId),
        claimName: claim ? claimDisplayName(claim.name) : null,
        ownerName: owner?.name ?? null,
    };
}

/** One craft as a row with no bounty. */
export function buildRow(craft: CraftMeta, inputs: RowInputs, recipes: RecipeIndex): CraftRow {
    const recipe = recipes.get(craft.recipeId);
    const progress = inputs.progress.get(craft.entityId);
    const ownerClaimMember = inputs.claimMembers.get(`${craft.claimEntityId}:${craft.ownerEntityId}`);

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
    );

    return {
        id: craft.entityId.toString(),
        entityId: craft.entityId,
        claimEntityId: craft.claimEntityId,
        ownerEntityId: craft.ownerEntityId,
        regionId: craft.regionId,
        recipeId: craft.recipeId,
        count: craft.count,
        firstSeenMs: craft.firstSeen.toMillis(),
        subject,
        privateBountyOwner: null,
        publicView: null,
        ...displayFields(craft.regionId, craft.claimEntityId, craft.ownerEntityId, inputs),
    } satisfies CraftRow;
}

/** Every open craft as a row with no bounty; `applyBounties` layers resolved bounties on top. */
export function craftRowsFrom(snapshot: CraftSnapshot, recipes: RecipeIndex): CraftRow[] {
    return snapshot.crafts.map(craft => buildRow(craft, snapshot, recipes));
}

/** `row` (which must carry no bounty) with `bounty` applied. */
export function applyBounty(row: CraftRow, bounty: AssignedBounty): CraftRow {
    const visible: CraftRow = {...row, subject: {...row.subject, ...bountyFields(bounty)}};
    if (!bounty.private) return visible;
    return {...visible, privateBountyOwner: bounty.assignedByAccountIdentity.toHexString(), publicView: row};
}

/**
 * `rows` with each craft's resolved bounty applied. Rows without a bounty are returned as-is (same
 * objects), so this costs a pass over the array plus one allocation per bountied craft.
 */
export function applyBounties(rows: readonly CraftRow[], assignments: ReadonlyMap<bigint, AssignedBounty>): CraftRow[] {
    if (assignments.size === 0) return rows as CraftRow[];
    return rows.map(row => {
        const bounty = assignments.get(row.entityId);
        return bounty ? applyBounty(row, bounty) : row;
    });
}
