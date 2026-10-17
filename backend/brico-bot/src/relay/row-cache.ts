/**
 * row-cache.ts — the relay tables mirrored from row callbacks, with each open craft's `CraftRow`
 * rebuilt only when something it depends on changes.
 *
 * Callbacks only record what became dirty; `drain()` does the work and returns the rows whose match
 * outcome may have changed. `readSnapshot` + `craftRowsFrom` + `applyBounties` is the full-rebuild
 * equivalent and the oracle `row-cache.test.ts` checks this against.
 */
import type {ClaimInfo, ClaimMember, CraftMeta, CraftProgress, PlayerState, Region} from "@brico/bindings/prism/types";

import {isDeepStrictEqual} from "node:util";

import type {RecipeIndex} from "../game-data/recipes.ts";
import {keyedFeed, type TableFeed} from "../spacetime/feed.ts";
import type {CraftSnapshot} from "./prism.ts";
import {applyBounty, type AssignedBounty, buildRow, type CraftRow, craftRowsFrom, displayFields} from "./subject.ts";

/** What `drain()` found changed since the previous drain. */
export interface RowDelta {
    /** True after `load`: every row is in `changed` and consumers should re-evaluate from scratch rather than apply a delta. */
    full: boolean;
    /** Rows (with bounties applied) that are new or whose match outcome may differ; feed to `applyDelta`. */
    changed: CraftRow[];
    /** Craft ids that left the open set. */
    removedIds: string[];
    /** Crafts whose contributions changed; the entitlement step's work list. */
    contributionCrafts: Set<bigint>;
    /** Players with a changed `claim_member` row; their automated loyalty bonuses may resolve differently. */
    memberPlayers: Set<bigint>;
    /** Crafts whose `craft_meta` row was deleted outright (not merely closed), whose stored bounty assignments can go. */
    deletedCrafts: Set<bigint>;
    /** Crafts in claims whose list of owners changed; their rows are unchanged but whose bounty resolution may differ. */
    ownerChangedCrafts: Set<bigint>;
}

export interface RowCache {
    readonly craftMeta: TableFeed<CraftMeta>;
    readonly craftProgress: TableFeed<CraftProgress>;
    readonly craftContribution: TableFeed<{craftId: bigint; playerId: bigint; contribution: number | bigint}>;
    readonly claimInfo: TableFeed<ClaimInfo>;
    readonly claimMember: TableFeed<ClaimMember>;
    readonly playerState: TableFeed<PlayerState>;
    readonly region: TableFeed<Region>;

    /** Replaces everything with `snapshot`'s contents and marks every open craft dirty. */
    load(snapshot: CraftSnapshot): void;
    /**
     * Adopts `assignments` and dirties each craft whose bounty changed. With `changed` (the crafts the
     * caller already knows differ), those are dirtied without diffing, and `assignments` is read live
     * afterwards rather than copied, so the caller must keep it current.
     */
    setAssignments(assignments: ReadonlyMap<bigint, AssignedBounty>, changed?: Iterable<bigint>): void;
    drain(): RowDelta;

    /** Every open craft's current row, bounties applied, keyed by `CraftRow.id`. */
    readonly rows: ReadonlyMap<string, CraftRow>;
    /** The same rows without bounties — what bounty resolution evaluates. */
    readonly baseRows: ReadonlyMap<string, CraftRow>;
    /** Live view of the mirrored tables (`crafts` is not maintained; use `rows`). Maps are mutated by callbacks, so read it synchronously. */
    readonly snapshot: CraftSnapshot;
}

function sameBounty(a: AssignedBounty, b: AssignedBounty): boolean {
    return a.ratioNumerator === b.ratioNumerator
        && a.ratioDenominator === b.ratioDenominator
        && a.currency === b.currency
        && a.private === b.private
        && a.assignedByAccountIdentity.toHexString() === b.assignedByAccountIdentity.toHexString();
}

function addTo<K>(index: Map<K, Set<bigint>>, key: K, id: bigint): void {
    const set = index.get(key);
    if (set) set.add(id);
    else index.set(key, new Set([id]));
}

function removeFrom<K>(index: Map<K, Set<bigint>>, key: K, id: bigint): void {
    const set = index.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) index.delete(key);
}

export function createRowCache(recipes: RecipeIndex): RowCache {
    const openCrafts = new Map<bigint, CraftMeta>();
    const snapshot: CraftSnapshot = {
        crafts: [],
        allCraftIds: new Set(),
        progress: new Map(),
        claims: new Map(),
        claimMembers: new Map(),
        contributions: new Map(),
        claimOwners: new Map(),
        players: new Map(),
        regions: new Map(),
        builtAtMs: 0,
    };
    // `claimEntityId -> playerEntityId -> row`, in table order, from which `claimOwners` is rebuilt per claim.
    const membersByClaim = new Map<bigint, Map<bigint, ClaimMember>>();

    const baseRows = new Map<string, CraftRow>();
    const rows = new Map<string, CraftRow>();
    let assignments: ReadonlyMap<bigint, AssignedBounty> = new Map();

    // Reverse indexes over `baseRows`, keyed like the maps they depend on.
    const craftsByClaimOwner = new Map<string, Set<bigint>>();
    const craftsByClaim = new Map<bigint, Set<bigint>>();
    const craftsByOwner = new Map<bigint, Set<bigint>>();

    let subjectDirty = new Set<bigint>();
    let displayDirty = new Set<bigint>();
    let contributionCrafts = new Set<bigint>();
    let memberPlayers = new Set<bigint>();
    let deletedCrafts = new Set<bigint>();
    let ownerChangedCrafts = new Set<bigint>();
    let fullPending = false;

    const dirtyAll = <K>(index: Map<K, Set<bigint>>, key: K, into: Set<bigint>) => {
        const ids = index.get(key);
        if (ids) for (const id of ids) into.add(id);
    };

    function unindex(row: CraftRow): void {
        if (row.claimEntityId !== 0n) {
            removeFrom(craftsByClaim, row.claimEntityId, row.entityId);
            if (row.ownerEntityId !== 0n) removeFrom(craftsByClaimOwner, `${row.claimEntityId}:${row.ownerEntityId}`, row.entityId);
        }
        if (row.ownerEntityId !== 0n) removeFrom(craftsByOwner, row.ownerEntityId, row.entityId);
    }

    function index(row: CraftRow): void {
        if (row.claimEntityId !== 0n) {
            addTo(craftsByClaim, row.claimEntityId, row.entityId);
            if (row.ownerEntityId !== 0n) addTo(craftsByClaimOwner, `${row.claimEntityId}:${row.ownerEntityId}`, row.entityId);
        }
        if (row.ownerEntityId !== 0n) addTo(craftsByOwner, row.ownerEntityId, row.entityId);
    }

    function setMember(row: ClaimMember): void {
        snapshot.claimMembers.set(`${row.claimEntityId}:${row.playerEntityId}`, row);
        let members = membersByClaim.get(row.claimEntityId);
        if (!members) membersByClaim.set(row.claimEntityId, (members = new Map()));
        members.set(row.playerEntityId, row);
        refreshOwners(row.claimEntityId);
        dirtyAll(craftsByClaimOwner, `${row.claimEntityId}:${row.playerEntityId}`, subjectDirty);
        memberPlayers.add(row.playerEntityId);
    }

    function deleteMember(row: ClaimMember): void {
        snapshot.claimMembers.delete(`${row.claimEntityId}:${row.playerEntityId}`);
        const members = membersByClaim.get(row.claimEntityId);
        members?.delete(row.playerEntityId);
        if (members?.size === 0) membersByClaim.delete(row.claimEntityId);
        refreshOwners(row.claimEntityId);
        dirtyAll(craftsByClaimOwner, `${row.claimEntityId}:${row.playerEntityId}`, subjectDirty);
        memberPlayers.add(row.playerEntityId);
    }

    function refreshOwners(claimId: bigint): void {
        const owners: bigint[] = [];
        for (const member of membersByClaim.get(claimId)?.values() ?? []) if (member.owner) owners.push(member.playerEntityId);
        const previous = snapshot.claimOwners.get(claimId) ?? [];
        if (owners.length > 0) snapshot.claimOwners.set(claimId, owners);
        else snapshot.claimOwners.delete(claimId);
        if (owners.length !== previous.length || owners.some((owner, i) => owner !== previous[i])) dirtyAll(craftsByClaim, claimId, ownerChangedCrafts);
    }

    function setContribution(row: {craftId: bigint; playerId: bigint; contribution: number | bigint}): void {
        let byPlayer = snapshot.contributions.get(row.craftId);
        if (!byPlayer) snapshot.contributions.set(row.craftId, (byPlayer = new Map()));
        byPlayer.set(row.playerId, BigInt(row.contribution));
        contributionCrafts.add(row.craftId);
    }

    function deleteContribution(row: {craftId: bigint; playerId: bigint}): void {
        const byPlayer = snapshot.contributions.get(row.craftId);
        byPlayer?.delete(row.playerId);
        if (byPlayer?.size === 0) snapshot.contributions.delete(row.craftId);
        contributionCrafts.add(row.craftId);
    }

    function setCraft(row: CraftMeta): void {
        snapshot.allCraftIds.add(row.entityId);
        if (row.status.tag === "Active") openCrafts.set(row.entityId, row);
        else openCrafts.delete(row.entityId);
        subjectDirty.add(row.entityId);
    }

    function deleteCraft(row: CraftMeta): void {
        snapshot.allCraftIds.delete(row.entityId);
        openCrafts.delete(row.entityId);
        subjectDirty.add(row.entityId);
        deletedCrafts.add(row.entityId);
    }

    function regionRowsDirty(regionId: number): void {
        for (const row of baseRows.values()) if (row.regionId === regionId) displayDirty.add(row.entityId);
    }

    function finalRow(base: CraftRow): CraftRow {
        const bounty = assignments.get(base.entityId);
        return bounty ? applyBounty(base, bounty) : base;
    }

    return {
        craftMeta: keyedFeed(row => row.entityId, setCraft, deleteCraft),
        craftProgress: keyedFeed(
            row => row.entityId,
            row => {
                snapshot.progress.set(row.entityId, row);
                subjectDirty.add(row.entityId);
            },
            row => {
                snapshot.progress.delete(row.entityId);
                subjectDirty.add(row.entityId);
            },
        ),
        craftContribution: keyedFeed(row => `${row.craftId}:${row.playerId}`, setContribution, deleteContribution),
        claimInfo: keyedFeed(
            row => row.entityId,
            row => {
                snapshot.claims.set(row.entityId, row);
                dirtyAll(craftsByClaim, row.entityId, displayDirty);
            },
            row => {
                snapshot.claims.delete(row.entityId);
                dirtyAll(craftsByClaim, row.entityId, displayDirty);
            },
        ),
        claimMember: keyedFeed(row => `${row.claimEntityId}:${row.playerEntityId}`, setMember, deleteMember),
        playerState: {
            insert(row) {
                snapshot.players.set(row.entityId, row);
                dirtyAll(craftsByOwner, row.entityId, displayDirty);
            },
            // Only a rename changes a row; `online`/region updates just replace the stored row.
            update(before, after) {
                snapshot.players.set(after.entityId, after);
                if (before.name !== after.name) dirtyAll(craftsByOwner, after.entityId, displayDirty);
            },
            delete(row) {
                snapshot.players.delete(row.entityId);
                dirtyAll(craftsByOwner, row.entityId, displayDirty);
            },
        },
        region: keyedFeed(
            row => row.id,
            row => {
                snapshot.regions.set(row.id, row);
                regionRowsDirty(row.id);
            },
            row => {
                snapshot.regions.delete(row.id);
                regionRowsDirty(row.id);
            },
        ),

        load(source) {
            openCrafts.clear();
            for (const craft of source.crafts) openCrafts.set(craft.entityId, craft);
            snapshot.allCraftIds = new Set(source.allCraftIds);
            snapshot.progress = new Map(source.progress);
            snapshot.claims = new Map(source.claims);
            snapshot.claimMembers = new Map(source.claimMembers);
            snapshot.contributions = new Map([...source.contributions].map(([craftId, byPlayer]) => [craftId, new Map(byPlayer)]));
            snapshot.claimOwners = new Map();
            snapshot.players = new Map(source.players);
            snapshot.regions = new Map(source.regions);
            membersByClaim.clear();
            for (const member of source.claimMembers.values()) {
                let members = membersByClaim.get(member.claimEntityId);
                if (!members) membersByClaim.set(member.claimEntityId, (members = new Map()));
                members.set(member.playerEntityId, member);
            }
            for (const claimId of membersByClaim.keys()) refreshOwners(claimId);

            baseRows.clear();
            rows.clear();
            craftsByClaimOwner.clear();
            craftsByClaim.clear();
            craftsByOwner.clear();
            subjectDirty = new Set(openCrafts.keys());
            displayDirty = new Set();
            contributionCrafts = new Set(snapshot.contributions.keys());
            memberPlayers = new Set();
            deletedCrafts = new Set();
            ownerChangedCrafts = new Set();
            fullPending = true;
        },

        setAssignments(next, changed) {
            if (changed) {
                for (const craftId of changed) subjectDirty.add(craftId);
                assignments = next;
                return;
            }
            for (const [craftId, bounty] of next) {
                const previous = assignments.get(craftId);
                if (!previous || !sameBounty(previous, bounty)) subjectDirty.add(craftId);
            }
            for (const craftId of assignments.keys()) if (!next.has(craftId)) subjectDirty.add(craftId);
            assignments = new Map(next);
        },

        drain() {
            const changed: CraftRow[] = [];
            const removedIds: string[] = [];

            for (const craftId of subjectDirty) {
                const craft = openCrafts.get(craftId);
                const id = craftId.toString();
                const previous = baseRows.get(id);
                if (previous) unindex(previous);
                if (!craft) {
                    if (previous) {
                        baseRows.delete(id);
                        rows.delete(id);
                        removedIds.push(id);
                    }
                    continue;
                }
                const base = buildRow(craft, snapshot, recipes);
                baseRows.set(id, base);
                index(base);
                const row = finalRow(base);
                rows.set(id, row);
                changed.push(row);
            }

            for (const craftId of displayDirty) {
                if (subjectDirty.has(craftId)) continue;
                const id = craftId.toString();
                const previous = baseRows.get(id);
                if (!previous) continue;
                const base = {...previous, ...displayFields(previous.regionId, previous.claimEntityId, previous.ownerEntityId, snapshot)};
                baseRows.set(id, base);
                rows.set(id, finalRow(base));
            }

            const delta = {full: fullPending, changed, removedIds, contributionCrafts, memberPlayers, deletedCrafts, ownerChangedCrafts};
            fullPending = false;
            subjectDirty = new Set();
            displayDirty = new Set();
            contributionCrafts = new Set();
            memberPlayers = new Set();
            deletedCrafts = new Set();
            ownerChangedCrafts = new Set();
            return delta;
        },

        rows,
        baseRows,
        snapshot,
    };
}

/**
 * The first way `cache` (as of its last `drain`) disagrees with `truth`, a snapshot read straight
 * from the relay tables, plus how many crafts differ; `null` when they agree. Rows are compared
 * without bounties, which are derived from the assignments the cache is handed.
 */
export function findDrift(cache: RowCache, truth: CraftSnapshot, recipes: RecipeIndex): {first: string; crafts: number} | null {
    const problems: string[] = [];
    if (!isDeepStrictEqual(truth.allCraftIds, cache.snapshot.allCraftIds)) problems.push("craft ids");
    if (!isDeepStrictEqual(truth.contributions, cache.snapshot.contributions)) problems.push("contributions");
    if (!isDeepStrictEqual(truth.claimOwners, cache.snapshot.claimOwners)) problems.push("claim owners");

    let crafts = 0;
    const noteCraft = (label: string) => {
        if (crafts++ === 0) problems.push(label);
    };
    const expectedIds = new Set<string>();
    for (const row of craftRowsFrom(truth, recipes)) {
        expectedIds.add(row.id);
        if (!isDeepStrictEqual(row, cache.baseRows.get(row.id))) noteCraft(`craft ${row.id}`);
    }
    for (const id of cache.baseRows.keys()) if (!expectedIds.has(id)) noteCraft(`craft ${id} (not open)`);
    return problems.length === 0 ? null : {first: problems.join(", "), crafts};
}
