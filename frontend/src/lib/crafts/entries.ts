/**
 * entries.ts — joins a relay `CraftSnapshot` with the static game data into the rows the craft
 * browser renders and the filter engine evaluates.
 *
 * This is where the two halves of a craft meet: the relay knows *which* crafts exist and how far
 * along they are, while only the game tables know what a `recipeId` actually produces, what tier
 * that item is, or what its skill is called. Everything the UI shows is resolved once, here, so a
 * row is a plain value the list can sort and the engine can test without re-doing lookups per cell.
 */
import type {CraftContribution, CraftStatus} from "@brico/bindings/prism/types";
import type {BuildingRequirement, CargoDesc, ItemDesc} from "@brico/bitcraft-bindings/types";
import {ItemType} from "@brico/bitcraft-bindings/types";
import {computeEntitlement} from "@brico/crafts/entitlement";
import type {CraftSubject} from "@brico/crafts/filter";
import {claimDisplayName, regionDisplayName} from "@brico/crafts/names";
import {buildCraftSubject, type CraftBountyFacts, type RecipeStatic} from "@brico/crafts/subject";
import {BitCraftTables} from "~/lib/bitcraft-data";
import type {CraftSnapshot} from "~/lib/crafts/relay";
import {getCraftingRecipeName} from "~/lib/relations";

/**
 * A recipe's first crafted stack, resolved to the row its icon and name come from. Tagged rather
 * than flattened because `ItemIcon` and `CargoIcon` take different props and draw different frames.
 */
export type CraftOutput =
    | {kind: "item"; desc: ItemDesc}
    | {kind: "cargo"; desc: CargoDesc};

/** A single open craft, fully resolved for display and filtering. */
export interface CraftEntry {
    /** Craft entity id as a decimal string — the list key, and the id form filters compare against. */
    id: string;
    regionId: number;
    regionName: string;
    recipeId: number;
    status: CraftStatus["tag"];
    recipeName: string;
    output: CraftOutput | null;
    itemName: string | null;
    skillName: string | null;
    skillIcon: string | null;
    /**
     * The **craft** tier, derived from the recipe's level requirement, not from the output item.
     */
    tier: number | null;
    /** Craft quantity. */
    count: number;
    effortTotal: number;
    effortDone: number;
    effortRemaining: number;
    /** `effortDone / effortTotal`, clamped to 0..1; 0 when the total is unknown. */
    fraction: number;
    /**
     * True when the order has hit its action count and is only waiting to be collected.
     */
    complete: boolean;
    claimName: string | null;
    ownerName: string | null;
    /**
     * True when the craft is open to anyone. A non-public craft is private to its owner.
     */
    public: boolean;
    firstSeenMs: number;
    lastActiveMs: number;
    subject: CraftSubject;
}

/**
 * The filter engine's key for a craft's output: the item/cargo id tagged with which one it is.
 */
function itemSubjectValue(stack: {itemId: number; itemType: ItemType} | undefined): string | null {
    if (!stack) return null;
    return `${stack.itemType.tag === ItemType.Item.tag ? "item" : "cargo"}:${stack.itemId}`;
}

/** A stack's item category (`ItemDesc.tag`/`CargoDesc.tag`), `null` when its desc hasn't resolved. */
function itemTagValue(
    stack: {itemId: number; itemType: ItemType} | undefined,
    items: ReadonlyMap<number, ItemDesc>,
    cargo: ReadonlyMap<number, CargoDesc>,
): string | null {
    if (!stack) return null;
    const desc = stack.itemType.tag === ItemType.Item.tag ? items.get(stack.itemId) : cargo.get(stack.itemId);
    return desc?.tag ?? null;
}

/** The `RecipeStatic` shape `@brico/crafts/subject` needs, resolved off `CraftingRecipeDesc`. */
function recipeStaticFrom(
    recipeDesc: {
        actionsRequired: number;
        levelRequirements: readonly {skillId: number; level: number}[];
        buildingRequirement: BuildingRequirement | undefined;
        craftedItemStacks: readonly {itemId: number; itemType: ItemType}[];
        consumedItemStacks: readonly {itemId: number; itemType: ItemType}[];
    } | undefined,
    items: ReadonlyMap<number, ItemDesc>,
    cargo: ReadonlyMap<number, CargoDesc>,
): RecipeStatic | undefined {
    if (!recipeDesc) return undefined;
    const requirement = recipeDesc.levelRequirements[0];
    const outputStack = recipeDesc.craftedItemStacks[0];
    return {
        effortRequired: recipeDesc.actionsRequired,
        skillId: requirement?.skillId ?? null,
        buildingType: recipeDesc.buildingRequirement?.buildingType ?? null,
        levelRequired: requirement?.level ?? 0,
        itemKey: itemSubjectValue(outputStack),
        itemTag: itemTagValue(outputStack, items, cargo),
        inputItems: recipeDesc.consumedItemStacks.map(stack => ({
            key: itemSubjectValue(stack)!,
            tag: itemTagValue(stack, items, cargo),
        })),
    };
}

/**
 * Builds every craft row in the snapshot.
 *
 * Reads the game tables through their cached `indexedBy` accessors, so calling this inside a memo
 * keeps the rows reactive to both the relay snapshot and the game data finishing its load (and to
 * a data-locale switch, which republishes the tables with translated names).
 *
 * `bountyAssignments` is `brico-app`'s resolved `craft_bounty_assignment` rows (see
 * `~/lib/crafts/bounty.ts`), keyed by craft entity id — a separate module from prism, so it's a
 * separate, optional join rather than something the relay snapshot itself carries.
 */
export function craftEntriesFrom(snapshot: CraftSnapshot, bountyAssignments?: ReadonlyMap<string, CraftBountyFacts>): CraftEntry[] {
    const recipeDescs = BitCraftTables.CraftingRecipeDesc.indexedBy("id")();
    const items = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargo = BitCraftTables.CargoDesc.indexedBy("id")();
    const skills = BitCraftTables.SkillDesc.indexedBy("id")();

    return snapshot.crafts.map(craft => {
        const recipeDesc = recipeDescs.get(craft.recipeId);
        const stack = recipeDesc?.craftedItemStacks?.at(0);

        let output: CraftOutput | null = null;
        if (stack) {
            if (stack.itemType.tag === ItemType.Item.tag) {
                const desc = items.get(stack.itemId);
                if (desc) output = {kind: "item", desc};
            } else {
                const desc = cargo.get(stack.itemId);
                if (desc) output = {kind: "cargo", desc};
            }
        }

        const progress = snapshot.progress.get(craft.entityId);
        const ownerClaimMember = snapshot.claimMembers.get(`${craft.claimEntityId}:${craft.ownerEntityId}`);
        const subject = buildCraftSubject(
            {
                regionId: craft.regionId,
                claimEntityId: craft.claimEntityId,
                ownerEntityId: craft.ownerEntityId,
                count: craft.count,
                public: craft.public,
                progressRaw: progress?.progress ?? 0,
            },
            recipeStaticFrom(recipeDesc, items, cargo),
            ownerClaimMember,
            bountyAssignments?.get(craft.entityId.toString()),
        );
        const effortDone = subject.effortTotal - subject.effortRemaining;

        const claim = craft.claimEntityId === 0n ? undefined : snapshot.claims.get(craft.claimEntityId);
        const owner = craft.ownerEntityId === 0n ? undefined : snapshot.players.get(craft.ownerEntityId);
        const skillId = recipeDesc?.levelRequirements[0]?.skillId ?? null;
        const skill = skillId === null ? undefined : skills.get(skillId);
        const firstSeenMs = Number(craft.firstSeen.toMillis());

        return {
            id: craft.entityId.toString(),
            regionId: craft.regionId,
            // The relay names regions itself (from upstream `world_region_name_state`), so there is
            // nothing to hardcode here — an id with no row yet just shows as its number.
            regionName: regionDisplayName(snapshot.regions.get(craft.regionId)?.name, craft.regionId),
            recipeId: craft.recipeId,
            status: craft.status.tag,
            recipeName: recipeDesc ? getCraftingRecipeName(recipeDesc) : `Recipe #${craft.recipeId}`,
            output,
            itemName: output?.desc.name ?? null,
            skillName: skill?.name ?? null,
            skillIcon: skill?.iconAssetName ?? null,
            tier: subject.tier,
            count: craft.count,
            effortTotal: subject.effortTotal,
            effortDone,
            effortRemaining: subject.effortRemaining,
            fraction: subject.effortTotal > 0 ? Math.min(effortDone / subject.effortTotal, 1) : 0,
            complete: subject.complete,
            claimName: claim ? claimDisplayName(claim.name) : null,
            ownerName: owner?.name ?? null,
            public: craft.public,
            firstSeenMs,
            lastActiveMs: progress ? Number(progress.lastSeen.toMillis()) : firstSeenMs,
            subject,
        } satisfies CraftEntry;
    });
}

/** One player's logged effort on a single craft, resolved for display. */
export interface CraftContributor {
    /** Player entity id as a decimal string — the list key. */
    playerId: string;
    /** Player name, or `null` when `player_state` has no row for them yet. */
    name: string | null;
    /** Effort this player has logged on the craft. */
    contribution: number;
    /**
     * This player's share of the effort logged on the craft *so far*, 0..1 — not of the effort the
     * craft requires. Contributions are what a payout is split by, and a payout can be computed on
     * a craft that is still in progress, so the denominator has to be the work actually done.
     */
    share: number;
    /**
     * This player's share of the craft's *total* required effort, 0..1 — unlike `share`, the
     * denominator here is the recipe's full `effortTotal` (actions × count), so it stays comparable
     * across snapshots taken at different points in the craft's progress. 0 when the recipe or its
     * effort requirement is unknown.
     */
    percentTotal: number;
    /**
     * Estimated entitlement under the craft's *current* bounty, via `computeEntitlement` against this
     * contributor's live cumulative effort. This is an estimate because bounties can change and loyalty
     * rewards can modify payouts as well.
     */
    estimatedPayout: bigint | null;
    /** The bounty's currency, alongside `estimatedPayout` — `null` exactly when it is. */
    currency: string | null;
    /** Whether this contributor is the owner of the craft. */
    isOwner: boolean;
}

/**
 * Resolves a craft's `craft_contribution` rows into contributor lines.
 */
export function craftContributorsFrom(
    snapshot: CraftSnapshot,
    contributions: readonly CraftContribution[],
    bounty?: CraftBountyFacts,
): CraftContributor[] {
    let total = 0;
    for (const row of contributions) total += row.contribution;

    // The snapshot here only ever holds the one matched craft (see `readCraftSnapshot`), so its
    // effort requirement is resolved straight off that row rather than via `craftEntriesFrom`.
    const craft = snapshot.crafts.at(0);
    const recipeDesc = craft ? BitCraftTables.CraftingRecipeDesc.indexedBy("id")().get(craft.recipeId) : undefined;
    const effortTotal = recipeDesc ? recipeDesc.actionsRequired * Math.max(craft!.count, 1) : 0;

    return contributions
        .map(row => ({
            playerId: row.playerId.toString(),
            name: snapshot.players.get(row.playerId)?.name ?? null,
            contribution: row.contribution,
            share: total > 0 ? row.contribution / total : 0,
            percentTotal: effortTotal > 0 ? row.contribution / effortTotal : 0,
            estimatedPayout: bounty ? computeEntitlement(BigInt(row.contribution), bounty.ratioNumerator, bounty.ratioDenominator) : null,
            currency: bounty?.currency ?? null,
            isOwner: row.playerId === craft?.ownerEntityId,
        }));
}
