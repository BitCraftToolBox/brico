/**
 * bridge.ts — the actual bridge: relay rows on one side, watches on the other, one filter engine.
 *
 * Individual SpacetimeDB modules cannot subscribe to each other, so joining prism's world data to
 * brico's per-user watches has to happen in a *client* that holds both connections. This function
 * is that join, and it is intentionally the only place in the process that knows both halves exist.
 *
 * Open crafts are projected into `CraftSubject`s (`relay/subject.ts`) and kept current by the
 * `RowCache`; each tick hands every watch the crafts that changed, with its filter, to
 * `@brico/crafts/watch`'s `createWatchMatcher` — the same added/finished/removed transition engine
 * the frontend runs for its own (backend-free) watches, so the two previews can never disagree about
 * what fired. A watch that is new, edited, re-owned, or following a full cache reload is re-evaluated
 * against every craft instead. What stays here, rather than in that shared
 * engine, is everything about *this* process's watches specifically: where they come from
 * (`WatchSource`), per-watch bookkeeping across snapshots (one matcher per watch id, pruned when a
 * watch disappears from the source), stats, and dispatch to a sink.
 */
import {type CompiledFilter, describeFilter} from "@brico/crafts/filter";
import {createWatchMatcher, type MatchEvent as EngineMatchEvent, type WatchMatcher} from "@brico/crafts/watch";
import {type AppCache, emptyAppDelta} from "./app/app-cache.ts";
import {type BountyEngine, bountyScope} from "./app/bounty-sink.ts";
import type {WatchSource, WatchSpec} from "./app/watch-source.ts";
import {compiledFilter} from "./compiled-filter.ts";

import type {RecipeIndex} from "./game-data/recipes.ts";
import type {Logger} from "./log.ts";
import {
    activeWatches,
    bountyAssignDuration,
    bountyEntitlementDuration,
    currentMatches,
    dirtyCraftsPerTick,
    startStep,
    watchEvaluationDuration,
    watchMatchesTotal
} from "./metrics.ts";
import type {CraftSnapshot} from "./relay/prism.ts";
import {createRowCache, type RowCache, type RowDelta} from "./relay/row-cache.ts";
import {type CraftRow, rowFor} from "./relay/subject.ts";

/** What the sink is told about. `finished` fires once, on the transition into completeness. */
export type TriggerKind = EngineMatchEvent<CraftRow>["kind"];

export interface MatchEvent {
    kind: TriggerKind;
    watch: WatchSpec;
    /** The craft, or just its id for `removed` (the row may be gone from the snapshot). */
    craft: CraftRow | null;
    craftId: string;
}

/** Where match events go. `main.ts` combines the logging sink with the notification sink; a Discord sink would join the same way. */
export type MatchSink = (event: MatchEvent) => void;

export interface BridgeStats {
    snapshots: number;
    lastSnapshotAtMs: number;
    lastOpenCrafts: number;
    /** watch id → current match count. */
    matchCounts: Map<string, number>;
    events: Record<TriggerKind, number>;
}

export interface Bridge {
    /** Run one tick over the changes the row cache has accumulated since the previous tick. */
    onTick(): void;
    /** Replace the cache's contents with `snapshot` and run a tick that re-evaluates every watch against it. */
    onSnapshot(snapshot: CraftSnapshot): void;
    readonly stats: BridgeStats;
    /** One-line summary for the heartbeat. */
    describe(): string;
}

export interface BridgeOptions {
    log: Logger;
    watches: WatchSource;
    sink: MatchSink;
    /** Static recipe facts (effort, skill, level, output item), read once from offline BSATN. */
    recipes: RecipeIndex;
    /** The cache the relay's row callbacks feed; a private one is created if omitted. */
    cache?: RowCache;
    /**
     * Bounty/payout resolution — optional so a bridge without a live `brico-app` connection (or a
     * test harness) can omit it entirely. When present, bounties are assigned *before* watches are
     * evaluated in the same tick — see the ordering note in `tick`.
     */
    bounty?: BountyEngine;
    /** The `brico-app` mirror `bounty` reads; its changes are drained each tick. Without one, `bounty` sees no `brico-app` changes. */
    appCache?: AppCache;
    /** Called once per tick with every open craft's resolved row (post-bounty-assignment), before watch matching. */
    onRowsComputed?(rows: CraftRow[]): void;
}

/** Per-watch state: its matcher, plus the inputs the matcher's current match set was computed with. */
interface WatchState {
    matcher: WatchMatcher<CraftRow>;
    filter: CompiledFilter | null;
    owner: string | null;
    view: (row: CraftRow) => CraftRow;
}

function mergeDeltas(first: RowDelta, second: RowDelta): RowDelta {
    if (second.changed.length === 0) return {...first, full: first.full || second.full};
    const changed = new Map(first.changed.map(row => [row.id, row]));
    for (const row of second.changed) changed.set(row.id, row);
    return {
        full: first.full || second.full,
        changed: [...changed.values()],
        removedIds: [...first.removedIds, ...second.removedIds],
        contributionCrafts: new Set([...first.contributionCrafts, ...second.contributionCrafts]),
        memberPlayers: new Set([...first.memberPlayers, ...second.memberPlayers]),
        deletedCrafts: new Set([...first.deletedCrafts, ...second.deletedCrafts]),
        ownerChangedCrafts: new Set([...first.ownerChangedCrafts, ...second.ownerChangedCrafts]),
    };
}

export function createBridge(options: BridgeOptions): Bridge {
    const log = options.log.child("bridge");
    const cache = options.cache ?? createRowCache(options.recipes);
    const watchStates = new Map<string, WatchState>();
    const stats: BridgeStats = {
        snapshots: 0,
        lastSnapshotAtMs: 0,
        lastOpenCrafts: 0,
        matchCounts: new Map(),
        events: {added: 0, finished: 0, removed: 0},
    };
    // Watches are logged the first time they are seen so a run's log explains what it is matching,
    // without re-printing the same descriptions every snapshot.
    const announced = new Set<string>();

    function emit(event: MatchEvent): void {
        stats.events[event.kind] += 1;
        watchMatchesTotal.inc({kind: event.kind});
        options.sink(event);
    }

    function tick(builtAtMs: number): void {
        let stop = startStep("cache_drain");
        let delta = cache.drain();
        const appDelta = options.appCache?.drain() ?? emptyAppDelta();
        stop();

        // Bounties must be assigned before watches are evaluated in this same tick — otherwise
        // a filter/notification referencing `payout` could see stale (null) data for a craft
        // that in fact already has a bounty. Resolution runs against the rows without bounties; a
        // craft whose bounty changed comes back from the second drain with `CraftSubject.payout`/
        // `currency` applied, so the watch-matching loop below sees live data.
        if (options.bounty) {
            const scope = bountyScope(delta, appDelta, cache.baseRows);
            const assignTimer = bountyAssignDuration.startTimer();
            const assigned = options.bounty.assign(cache.snapshot, cache.baseRows.values(), scope);
            assignTimer();

            const entitlementTimer = bountyEntitlementDuration.startTimer();
            options.bounty.updateEntitlements(cache.snapshot, scope);
            entitlementTimer();

            options.bounty.updateLoyaltyBonuses(cache.snapshot, scope);

            stop = startStep("cache_assignments");
            cache.setAssignments(assigned.bounties, assigned.changed);
            delta = mergeDeltas(delta, cache.drain());
            stop();
        }
        dirtyCraftsPerTick.observe(delta.changed.length);

        let allRows: CraftRow[] | undefined;
        const everyRow = () => (allRows ??= [...cache.rows.values()]);

        if (options.onRowsComputed) options.onRowsComputed(everyRow());

        stop = startStep("watch_source");
        const watches = options.watches.watches();
        stop();

        stats.snapshots += 1;
        stats.lastSnapshotAtMs = builtAtMs;
        stats.lastOpenCrafts = cache.rows.size;

        const liveWatchIds = new Set<string>();

        const watchTimer = watchEvaluationDuration.startTimer();
        for (const watch of watches) {
            liveWatchIds.add(watch.id);
            if (!announced.has(watch.id)) {
                announced.add(watch.id);
                log.info("watching", {id: watch.id, name: watch.name, filter: describeFilter(watch.filter)});
            }

            let state = watchStates.get(watch.id);
            if (!state) {
                const created: WatchState = {matcher: createWatchMatcher<CraftRow>(), filter: null, owner: null, view: row => rowFor(row, created.owner)};
                watchStates.set(watch.id, (state = created));
            }

            const filter = compiledFilter(watch.filter);
            const {matcher} = state;
            const wasPrimed = matcher.primed;
            // The delta is only valid for a matcher whose match set was computed with this same
            // filter and viewer, over the cache contents the delta is relative to.
            const incremental = wasPrimed && !delta.full && state.filter === filter && state.owner === watch.owner;
            state.filter = filter;
            state.owner = watch.owner;

            const events = incremental
                ? matcher.applyDelta(filter, delta.changed, delta.removedIds, state.view)
                : matcher.update(filter, everyRow(), state.view);
            for (const event of events) emit({...event, watch});
            if (!wasPrimed) {
                log.info("primed", {id: watch.id, matches: matcher.matchCount, of: cache.rows.size});
            }

            stats.matchCounts.set(watch.id, matcher.matchCount);
        }
        watchTimer();

        // A watch that disappeared from the source (deleted saved filter, edited file) must not
        // keep its match set around: if it comes back, every current match is legitimately
        // "added" again, and holding stale state would suppress exactly those notifications.
        for (const watchId of [...watchStates.keys()]) {
            if (liveWatchIds.has(watchId)) continue;
            watchStates.delete(watchId);
            stats.matchCounts.delete(watchId);
            announced.delete(watchId);
            log.info("watch removed from source, dropping match state", {id: watchId});
        }

        activeWatches.set(stats.matchCounts.size);
        currentMatches.set([...stats.matchCounts.values()].reduce((sum, count) => sum + count, 0));
    }

    return {
        stats,

        onTick() {
            tick(Date.now());
        },

        onSnapshot(snapshot) {
            cache.load(snapshot);
            tick(snapshot.builtAtMs);
        },

        // Deliberately a summary, not a per-watch breakdown — with enough saved filters this line
        // would otherwise grow without bound on every heartbeat. Per-watch match counts live in
        // `stats.matchCounts` for anything that needs them in-process; `metrics.ts`'s
        // `activeWatches`/`currentMatches` gauges are the aggregate, scrapable equivalent.
        describe() {
            const totalMatches = [...stats.matchCounts.values()].reduce((sum, count) => sum + count, 0);
            const ageMs = stats.lastSnapshotAtMs === 0 ? -1 : Date.now() - stats.lastSnapshotAtMs;
            return `snapshots=${stats.snapshots} openCrafts=${stats.lastOpenCrafts} watches=${stats.matchCounts.size} totalMatches=${totalMatches} snapshotAgeMs=${ageMs} events[added=${stats.events.added} finished=${stats.events.finished} removed=${stats.events.removed}]`;
        },
    };
}

/**
 * Fans one match event out to every sink, in order. Wrap, don't reshape — same style as
 * `createLayeredWatchSource`: the bridge still holds exactly one `MatchSink`, and `main.ts` decides
 * what actually receives events (logging today, `brico-app` notifications too, Discord later).
 */
export function combineSinks(...sinks: MatchSink[]): MatchSink {
    return event => {
        for (const sink of sinks) sink(event);
    };
}

/**
 * Logs the event. Kept separate from `createBridge` so a future sink joins beside this one instead
 * of editing the matching logic — and so a test can assert on events without parsing log output.
 */
export function createLoggingSink(log: Logger): MatchSink {
    const scoped = log.child("match");
    return event => {
        const craft = event.craft;
        scoped.info(event.kind, {
            watch: event.watch.id,
            craft: event.craftId,
            recipe: craft?.recipeId,
            count: craft?.count,
            region: craft?.regionName,
            claim: craft?.claimName ?? undefined,
            owner: craft?.ownerName ?? undefined,
            tier: craft?.subject.tier ?? undefined,
            effort: craft ? `${craft.subject.effortTotal - craft.subject.effortRemaining}/${craft.subject.effortTotal}` : undefined,
        });
    };
}
