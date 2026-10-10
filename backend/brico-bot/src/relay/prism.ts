/**
 * prism.ts — the bridge's connection to prism's `relay-module` (the BitCraft read-mirror).
 *
 * Row callbacks feed a `RowCache` (`row-cache.ts`), which keeps the joined craft rows current;
 * the coalescer then ticks the consumer at most once per interval. The full table read
 * (`readSnapshot`) seeds the cache when a subscription applies and is what the periodic
 * reconciliation compares the cache against. A craft's *recipe* is not subscribed to — that's static
 * game data, read once from offline BSATN via `../game-data/recipes.ts`.
 */
import {DbConnection, type SubscriptionHandle, tables} from "@brico/bindings/prism";
import type {ClaimInfo, ClaimMember, CraftMeta, CraftProgress, PlayerState, Region} from "@brico/bindings/prism/types";
import type {SpacetimeTarget} from "../config.ts";
import type {RecipeIndex} from "../game-data/recipes.ts";
import type {Logger} from "../log.ts";
import {relayDriftTotal, snapshotBuildDuration, startStep} from "../metrics.ts";
import {createCoalescer} from "../spacetime/coalesce.ts";
import {createSupervisedConnection, type SupervisedConnection, type SupervisorOptions} from "../spacetime/connection.ts";
import {attachFeed, type RowEvents, type TableFeed} from "../spacetime/feed.ts";
import {findDrift, type RowCache} from "./row-cache.ts";

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

function readClaimMembers(conn: DbConnection): Pick<CraftSnapshot, "claimMembers" | "claimOwners"> {
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
    return {claimMembers, claimOwners};
}

/** Reads every relay table into a snapshot. */
export function readSnapshot(conn: DbConnection): CraftSnapshot {
    const progress = new Map<bigint, CraftProgress>();
    for (const row of conn.db.craftProgress.iter()) progress.set(row.entityId, row);

    const claims = new Map<bigint, ClaimInfo>();
    for (const row of conn.db.claimInfo.iter()) claims.set(row.entityId, row);

    const {claimMembers, claimOwners} = readClaimMembers(conn);

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
    start(): void;
    stop(): void;
    /**
     * Marks the coalescer dirty so the next tick (within `snapshotIntervalMs`) runs, even though
     * nothing in prism itself changed — used to promptly reflect a `brico-app`-only change (a bounty
     * rule or loyalty reward edit) without a second timer.
     */
    mark(): void;
}

export interface PrismRelayOptions extends SupervisorOptions {
    target: SpacetimeTarget;
    /** How long row changes are coalesced before `onTick` runs. */
    snapshotIntervalMs: number;
    /** Kept current by the relay's row callbacks; the consumer drains it from `onTick`. */
    cache: RowCache;
    recipes: RecipeIndex;
    /** Called once per coalesced tick, after the cache has been loaded from the initial subscription. */
    onTick(): void;
    /** How often to compare the cache against a full table read, adopting the full read on drift. 0 disables. */
    reconcileIntervalMs: number;
}

export function createPrismRelay(options: PrismRelayOptions): PrismRelay {
    const log: Logger = options.log.child("relay");
    const {cache} = options;
    let current: DbConnection | null = null;
    // Row callbacks are ignored until the initial subscription has been loaded into the cache.
    let live = false;
    let lastReconcileMs = Date.now();

    const reconcile = (conn: DbConnection) => {
        const stop = startStep("reconcile");
        const drift = findDrift(cache, readSnapshot(conn), options.recipes);
        if (drift) {
            relayDriftTotal.inc();
            log.error("row cache drifted from the relay tables; adopting a full read", drift);
            cache.load(readSnapshot(conn));
            coalescer.mark();
        }
        stop();
    };

    const rebuild = () => {
        if (!current?.isActive || !live) return;
        const stopTick = startStep("tick_total");
        options.onTick();
        stopTick();
        if (options.reconcileIntervalMs > 0 && Date.now() - lastReconcileMs >= options.reconcileIntervalMs) {
            lastReconcileMs = Date.now();
            reconcile(current);
        }
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
                live = false;

                // Rows delivered with the initial subscription are covered by the full read at
                // `onApplied`, so only later transactions reach the cache.
                const accepts = (callbackCtx: {event: {tag: string}}) => live && callbackCtx.event.tag !== "SubscribeApplied";
                const feed = <T>(table: RowEvents<T>, target: TableFeed<T>, changed?: (before: T, after: T) => boolean) =>
                    attachFeed(table, target, accepts, coalescer.mark, changed);
                feed(conn.db.craftMeta, cache.craftMeta);
                feed(conn.db.craftProgress, cache.craftProgress);
                feed(conn.db.craftContribution, cache.craftContribution);
                feed(conn.db.claimInfo, cache.claimInfo);
                feed(conn.db.claimMember, cache.claimMember);
                feed(conn.db.region, cache.region);
                // A player's `online` flag and region churn constantly and nothing reads them; only a
                // rename changes what a row says.
                feed(conn.db.playerState, cache.playerState, (before, after) => before.name !== after.name);

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
                        const timer = snapshotBuildDuration.startTimer();
                        cache.load(readSnapshot(conn));
                        timer();
                        live = true;
                        lastReconcileMs = Date.now();
                        ctx.setLive();
                        coalescer.flush();
                        log.info("initial snapshot applied", {
                            openCrafts: cache.baseRows.size,
                            claims: cache.snapshot.claims.size,
                            claimMembers: cache.snapshot.claimMembers.size,
                            contributingCrafts: cache.snapshot.contributions.size,
                            players: cache.snapshot.players.size,
                            regions: cache.snapshot.regions.size,
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
                    live = false;
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
        start() {
            coalescer.start();
            connection.start();
        },
        stop() {
            coalescer.stop();
            connection.stop();
        },
        mark: coalescer.mark,
    };
}
