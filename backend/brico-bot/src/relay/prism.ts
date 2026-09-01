/**
 * prism.ts — the bridge's connection to prism's `relay-module` (the BitCraft read-mirror).
 *
 * Publishes a coalesced *snapshot* of raw relay rows rather than per-row events, for the same
 * reason `frontend/src/lib/crafts/relay.ts` does: filter evaluation needs the whole joined picture
 * (a craft's claim, its owner's membership in that claim), so a per-row callback can't usefully
 * answer "does this match" on its own, and progress deltas arrive far faster than any consumer
 * needs to re-decide. A craft's *recipe* is deliberately not part of this — that's static game
 * data, read once from offline BSATN via `../game-data/recipes.ts`, not something to subscribe to.
 *
 * The snapshot holds relay rows untouched. Projecting them into something the filter engine can
 * evaluate is `subject.ts`'s job.
 */
import {DbConnection, type SubscriptionHandle, tables} from "@brico/bindings/prism";
import type {ClaimInfo, ClaimMember, CraftMeta, CraftProgress, PlayerState, Region} from "@brico/bindings/prism/types";
import type {SpacetimeTarget} from "../config.ts";
import type {Logger} from "../log.ts";
import {snapshotBuildDuration} from "../metrics.ts";
import {createCoalescer} from "../spacetime/coalesce.ts";
import {createSupervisedConnection, type SupervisedConnection, type SupervisorOptions} from "../spacetime/connection.ts";

/** How much progress-per-player has arrived on a still-open craft, for the payout phase's per-contributor entitlement math. */
type ContributionMap = Map<bigint, Map<bigint, bigint>>;

/** Everything the bridge reads out of the relay, joined by the ids the filter engine needs. */
export interface CraftSnapshot {
    /** Only `Active` crafts — see `isOpen`. */
    crafts: CraftMeta[];
    /**
     * Every `craft_meta` entityId currently mirrored, even if not 'Active'. Used to clear
     * bounties from crafts when they become canceled/collected.
     */
    allCraftIds: Set<bigint>;
    /** Keyed by the craft's `entityId`; `craft_progress` has no region column. */
    progress: Map<bigint, CraftProgress>;
    claims: Map<bigint, ClaimInfo>;
    /** Keyed by `` `${claimEntityId}:${playerEntityId}` `` — a *specific* player's claim access. */
    claimMembers: Map<string, ClaimMember>;
    /** Cumulative contribution per craft, per contributor — `craftId -> playerId -> effort`. Feeds
     * the payout phase's `computeEntitlement`, never the filter engine (which only needs the
     * craft-level totals `buildCraftSubject` already derives from `craft_progress`). */
    contributions: ContributionMap;
    /** `claimEntityId -> playerEntityId[]` with `owner === true` for that claim — every owner, not
     * just a specific player's own membership row (unlike `claimMembers`), since bounty resolution
     * needs to ask "who owns this claim" independent of whom the craft's own owner is. */
    claimOwners: Map<bigint, bigint[]>;
    players: Map<bigint, PlayerState>;
    regions: Map<number, Region>;
    /** When this snapshot was built, for staleness reporting. */
    builtAtMs: number;
}

export const EMPTY_SNAPSHOT: CraftSnapshot = {
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

/**
 * Crafts that are actually live work.
 *
 * `craft_meta` retains a craft for 24 hours after it leaves the game, flipping `status` to
 * `Claimed`/`Removed` instead of deleting the row, so history stays queryable. Every consumer has
 * to apply this filter itself — the relay does not drop the row, and its query builder can't
 * compare a sum-typed column server-side, so it can't be pushed into the subscription either.
 * Without it the bridge would fire watch notifications for a day's worth of dead orders.
 */
function isOpen(craft: CraftMeta): boolean {
    return craft.status.tag === "Active";
}

function readSnapshot(conn: DbConnection): CraftSnapshot {
    const progress = new Map<bigint, CraftProgress>();
    for (const row of conn.db.craftProgress.iter()) progress.set(row.entityId, row);

    const claims = new Map<bigint, ClaimInfo>();
    for (const row of conn.db.claimInfo.iter()) claims.set(row.entityId, row);

    const claimMembers = new Map<string, ClaimMember>();
    const claimOwners = new Map<bigint, bigint[]>();
    for (const row of conn.db.claimMember.iter() as Iterable<ClaimMember>) {
        claimMembers.set(`${row.claimEntityId}:${row.playerEntityId}`, row);
        if (row.owner) {
            const owners = claimOwners.get(row.claimEntityId);
            if (owners) owners.push(row.playerEntityId);
            else claimOwners.set(row.claimEntityId, [row.playerEntityId]);
        }
    }

    const contributions: ContributionMap = new Map();
    for (const row of conn.db.craftContribution.iter()) {
        let byPlayer = contributions.get(row.craftId);
        if (!byPlayer) {
            byPlayer = new Map();
            contributions.set(row.craftId, byPlayer);
        }
        byPlayer.set(row.playerId, BigInt(row.contribution));
    }

    const players = new Map<bigint, PlayerState>();
    for (const row of conn.db.playerState.iter()) players.set(row.entityId, row);

    const regions = new Map<number, Region>();
    for (const row of conn.db.region.iter()) regions.set(row.id, row);

    const allCraftMeta = [...conn.db.craftMeta.iter()];
    const allCraftIds = new Set(allCraftMeta.map(craft => craft.entityId));

    return {
        crafts: allCraftMeta.filter(isOpen),
        allCraftIds,
        progress,
        claims,
        claimMembers,
        contributions,
        claimOwners,
        players,
        regions,
        builtAtMs: Date.now(),
    };
}

export interface PrismRelay {
    readonly connection: SupervisedConnection<DbConnection>;
    /** Most recent coalesced snapshot; `EMPTY_SNAPSHOT` until the first subscription applies. */
    readonly snapshot: CraftSnapshot;
    start(): void;
    stop(): void;
}

export interface PrismRelayOptions extends SupervisorOptions {
    target: SpacetimeTarget;
    /** How long row changes are coalesced before the snapshot is rebuilt. */
    snapshotIntervalMs: number;
    /** Called with each freshly built snapshot. This is what drives the bridge. */
    onSnapshot(snapshot: CraftSnapshot): void;
}

export function createPrismRelay(options: PrismRelayOptions): PrismRelay {
    const log: Logger = options.log.child("relay");
    let snapshot: CraftSnapshot = EMPTY_SNAPSHOT;
    let current: DbConnection | null = null;

    const rebuild = () => {
        if (!current?.isActive) return;
        const timer = snapshotBuildDuration.startTimer();
        snapshot = readSnapshot(current);
        timer();
        options.onSnapshot(snapshot);
    };
    const coalescer = createCoalescer(rebuild, options.snapshotIntervalMs);

    const connection = createSupervisedConnection<DbConnection>(
        {
            label: options.target.label,
            uri: options.target.uri,
            database: options.target.database,
            dial: handlers =>
                DbConnection.builder()
                    .withUri(options.target.uri)
                    .withDatabaseName(options.target.database)
                    .withToken(handlers.token)
                    .onConnect((conn, identity, token) => handlers.onConnect(conn, identity, token))
                    .onDisconnect((_ctx, error) => handlers.onDisconnect(error))
                    .onConnectError((_ctx, error) => handlers.onConnectError(error))
                    .build(),
            onConnected: (conn, ctx) => {
                current = conn;

                for (const table of [
                    conn.db.craft_meta,
                    conn.db.craft_progress,
                    conn.db.claim_info,
                    conn.db.claim_member,
                    conn.db.craft_contribution,
                    conn.db.player_state,
                    conn.db.region,
                ]) {
                    table.onInsert(coalescer.mark);
                    table.onDelete(coalescer.mark);
                    table.onUpdate(coalescer.mark);
                }

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
                        ctx.setLive();
                        coalescer.flush();
                        log.info("initial snapshot applied", {
                            openCrafts: snapshot.crafts.length,
                            claims: snapshot.claims.size,
                            claimMembers: snapshot.claimMembers.size,
                            contributingCrafts: snapshot.contributions.size,
                            players: snapshot.players.size,
                            regions: snapshot.regions.size,
                        });
                    })
                    .onError(errorCtx => {
                        ctx.setError(`subscription error: ${errorCtx.event ? String(errorCtx.event) : "unknown"}`);
                    })
                    .subscribe([
                        tables.craftMeta,
                        tables.craftProgress,
                        tables.claimInfo,
                        tables.claimMember,
                        tables.craftContribution,
                        tables.playerState,
                        tables.region,
                    ]);

                return () => {
                    subscription?.unsubscribe();
                    subscription = null;
                    if (current === conn) current = null;
                };
            },
        },
        {tokens: options.tokens, log: options.log, delayMs: options.delayMs, maxDelayMs: options.maxDelayMs},
    );

    return {
        connection,
        get snapshot() {
            return snapshot;
        },
        start() {
            coalescer.start();
            connection.start();
        },
        stop() {
            coalescer.stop();
            connection.stop();
        },
    };
}
