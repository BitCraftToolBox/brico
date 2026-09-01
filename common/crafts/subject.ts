/**
 * subject.ts — builds a `CraftSubject` (see `./filter`) from the plain facts of a craft.
 *
 * `@brico/crafts/filter` knows how to evaluate a `FilterNode` against a `CraftSubject`, but nothing
 * about where a subject comes from — that used to mean the same arithmetic was hand-kept in sync
 * between `frontend/src/lib/crafts/entries.ts` (which also resolves display data off the game
 * tables) and `backend/brico-bot/src/relay/subject.ts` (which only needs enough to match and log).
 * Both callers get *some* of a craft's facts from prism's relay (region/claim/owner ids, count,
 * public, live progress) and *some* from static game data resolved differently on each side (the
 * frontend reads `CraftingRecipeDesc` reactively through `BitCraftTables`; the bot loads it once at
 * startup into a plain `RecipeIndex`) — `RecipeStatic` is the flattened shape both sides can produce
 * that shape into, so this function is the one place the actual `CraftSubject` math lives.
 *
 * Deliberately takes plain data rather than relay row types: a `bigint`/`number`/`boolean` shape has
 * no SpacetimeDB SDK or generated-binding dependency, which is what keeps this module — like
 * `filter.ts` and `names.ts` beside it — importable from bare `node --test` with no build step.
 */
import type {ClaimAccessFlag, CraftInputItem, CraftSubject} from "./filter.ts";

/** The static facts about a recipe a craft runs — read once, never per-snapshot. */
export interface RecipeStatic {
    /** Per-unit-crafted effort; a craft's actual total is this × its `count`. */
    effortRequired: number;
    skillId: number | null;
    buildingType: number | null;
    levelRequired: number;
    /** `"item:<id>"` or `"cargo:<id>"` — see `CraftSubject.item` for why the id alone isn't a key. */
    itemKey: string | null;
    /** The output item's category (`ItemDesc.tag`/`CargoDesc.tag`) — see `CraftSubject.itemTag`. */
    itemTag: string | null;
    /** The recipe's consumed items — see `CraftSubject.inputItems`. */
    inputItems: readonly CraftInputItem[];
}

/** The permission columns of a single `claim_member` row — everything but the keys. */
export interface ClaimMemberFlags {
    build: boolean;
    inventory: boolean;
    officer: boolean;
    coOwner: boolean;
    owner: boolean;
}

/** The resolved `craft_bounty_assignment`/`craft_private_bounty_assignment` row for a craft — everything `CraftSubject` needs of it. */
export interface CraftBountyFacts {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    /** Whether this bounty came from `craft_private_bounty_assignment` rather than the public table. */
    private: boolean;
}

/** The relay facts about a craft that feed `CraftSubject` — everything except its recipe. */
export interface CraftFacts {
    regionId: number;
    /** `0n` when the craft has no claim — see `optionalId`. */
    claimEntityId: bigint;
    /** `0n` when the craft has no owner — see `optionalId`. */
    ownerEntityId: bigint;
    count: number;
    public: boolean;
    /** Raw `craft_progress.progress`, before clamping to the recipe's total. */
    progressRaw: number;
}

/** BitCraft ids are never negative, so 0 is the relay's "absent" marker for an entity reference. */
export function optionalId(value: bigint): string | null {
    return value === 0n ? null : value.toString();
}

/** Every ten levels of requirement is one tier; anything below level 10 is tier 1. */
export function craftTier(levelRequired: number): number {
    return Math.max(Math.floor(levelRequired / 10), 1);
}

/**
 * The claim access flags the craft's **owner** holds in the craft's **own** claim — not an
 * arbitrary claim and not any other member.
 *
 * `null` when there is nothing to check (no claim, or no owner). An empty array when both exist but
 * `member` is `undefined` (the owner holds no `claim_member` row there): a real, known fact ("not a
 * member"), which must not collapse into the `null` "unknown" case, or `not(ownerAccess eq member)`
 * would wrongly match crafts whose claim or owner is merely unresolved.
 */
export function ownerClaimAccessFor(
    claimEntityId: bigint,
    ownerEntityId: bigint,
    member: ClaimMemberFlags | undefined,
): readonly ClaimAccessFlag[] | null {
    if (claimEntityId === 0n || ownerEntityId === 0n) return null;
    if (!member) return [];
    const flags: ClaimAccessFlag[] = ["member"];
    if (member.build) flags.push("build");
    if (member.inventory) flags.push("inventory");
    if (member.officer) flags.push("officer");
    if (member.coOwner) flags.push("coOwner");
    if (member.owner) flags.push("owner");
    return flags;
}

/**
 * The `CraftSubject` for one craft, given its relay facts, its recipe's static facts (`undefined`
 * when the recipe id has no known row), its owner's `claim_member` row in its own claim
 * (`undefined` when there is none), and its resolved `craft_bounty_assignment` row (`undefined`
 * when the craft has no bounty) — joined the same way `ownerClaimMember` is: the caller does the
 * actual table lookup, this function only ever consumes the resolved row.
 */
export function buildCraftSubject(
    craft: CraftFacts,
    recipe: RecipeStatic | undefined,
    ownerClaimMember: ClaimMemberFlags | undefined,
    bounty?: CraftBountyFacts,
): CraftSubject {
    const effortTotal = (recipe?.effortRequired ?? 0) * Math.max(craft.count, 1);
    const effortDone = Math.min(craft.progressRaw, effortTotal || Infinity);
    const effortRemaining = Math.max(effortTotal - effortDone, 0);
    const tier = recipe ? craftTier(recipe.levelRequired) : null;

    return {
        region: craft.regionId,
        claim: optionalId(craft.claimEntityId),
        item: recipe?.itemKey ?? null,
        itemTag: recipe?.itemTag ?? null,
        inputItems: recipe?.inputItems ?? [],
        skill: recipe?.skillId ?? null,
        buildingType: recipe?.buildingType ?? null,
        tier,
        effortTotal,
        effortRemaining,
        public: craft.public,
        complete: effortTotal > 0 && effortRemaining === 0,
        owner: optionalId(craft.ownerEntityId),
        ownerClaimAccess: ownerClaimAccessFor(craft.claimEntityId, craft.ownerEntityId, ownerClaimMember),
        // A float approximation of the exact ratio, for filtering/sorting/display only — see
        // `CraftSubject.payout`'s doc comment. The real ledger math never goes through this.
        payout: bounty ? Number(bounty.ratioNumerator) / Number(bounty.ratioDenominator) : null,
        currency: bounty?.currency ?? null,
        bountyPrivate: bounty?.private ?? false,
    };
}
