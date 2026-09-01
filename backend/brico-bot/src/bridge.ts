/**
 * bridge.ts — the actual bridge: relay rows on one side, watches on the other, one filter engine.
 *
 * Individual SpacetimeDB modules cannot subscribe to each other, so joining prism's world data to
 * brico's per-user watches has to happen in a *client* that holds both connections. This function
 * is that join, and it is intentionally the only place in the process that knows both halves exist.
 *
 * Per snapshot it projects every open craft into a `CraftSubject` (`relay/subject.ts`) and hands
 * each watch's rows and filter to `@brico/crafts/watch`'s `createWatchMatcher` — the same
 * added/finished/removed transition engine the frontend runs for its own (backend-free) watches, so
 * the two previews can never disagree about what fired. What stays here, rather than in that shared
 * engine, is everything about *this* process's watches specifically: where they come from
 * (`WatchSource`), per-watch bookkeeping across snapshots (one matcher per watch id, pruned when a
 * watch disappears from the source), stats, and dispatch to a sink.
 */
import {describeFilter} from "@brico/crafts/filter";
import {createWatchMatcher, type MatchEvent as EngineMatchEvent, type WatchMatcher} from "@brico/crafts/watch";
import type {BountyEngine} from "./app/bounty-sink.ts";
import type {WatchSource, WatchSpec} from "./app/watch-source.ts";

import type {RecipeIndex} from "./game-data/recipes.ts";
import type {Logger} from "./log.ts";
import {activeWatches, bountyAssignDuration, bountyEntitlementDuration, currentMatches, watchEvaluationDuration, watchMatchesTotal} from "./metrics.ts";
import type {CraftSnapshot} from "./relay/prism.ts";
import {type CraftRow, craftRowsFrom} from "./relay/subject.ts";

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
    /** Feed a freshly built relay snapshot through every watch. */
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
    /**
     * Bounty/payout resolution — optional so a bridge without a live `brico-app` connection (or a
     * test harness) can omit it entirely. When present, bounties are assigned *before* watches are
     * evaluated in the same tick — see the ordering note in `onSnapshot`.
     */
    bounty?: BountyEngine;
}

export function createBridge(options: BridgeOptions): Bridge {
    const log = options.log.child("bridge");
    const matchers = new Map<string, WatchMatcher<CraftRow>>();
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

    return {
        stats,

        onSnapshot(snapshot) {
            let rows = craftRowsFrom(snapshot, options.recipes);

            // Bounties must be assigned before watches are evaluated in this same tick — otherwise
            // a filter/notification referencing `payout` could see stale (null) data for a craft
            // that in fact already has a bounty. `rows` is rebuilt a second time, now with
            // `CraftSubject.payout`/`currency` resolved, so the watch-matching loop below sees live
            // data.
            if (options.bounty) {
                const assignTimer = bountyAssignDuration.startTimer();
                const assignments = options.bounty.assign(snapshot, rows);
                assignTimer();

                const entitlementTimer = bountyEntitlementDuration.startTimer();
                options.bounty.updateEntitlements(snapshot, assignments);
                entitlementTimer();

                rows = craftRowsFrom(snapshot, options.recipes, assignments);
            }

            const watches = options.watches.watches();

            stats.snapshots += 1;
            stats.lastSnapshotAtMs = snapshot.builtAtMs;
            stats.lastOpenCrafts = rows.length;

            const liveWatchIds = new Set<string>();

            const watchTimer = watchEvaluationDuration.startTimer();
            for (const watch of watches) {
                liveWatchIds.add(watch.id);
                if (!announced.has(watch.id)) {
                    announced.add(watch.id);
                    log.info("watching", {id: watch.id, name: watch.name, filter: describeFilter(watch.filter)});
                }

                let matcher = matchers.get(watch.id);
                if (!matcher) {
                    matcher = createWatchMatcher<CraftRow>();
                    matchers.set(watch.id, matcher);
                }

                const wasPrimed = matcher.primed;
                for (const event of matcher.update(watch.filter, rows)) {
                    emit({...event, watch});
                }
                if (!wasPrimed) {
                    log.info("primed", {id: watch.id, matches: matcher.matchCount, of: rows.length});
                }

                stats.matchCounts.set(watch.id, matcher.matchCount);
            }
            watchTimer();

            // A watch that disappeared from the source (deleted saved filter, edited file) must not
            // keep its match set around: if it comes back, every current match is legitimately
            // "added" again, and holding stale state would suppress exactly those notifications.
            for (const watchId of [...matchers.keys()]) {
                if (liveWatchIds.has(watchId)) continue;
                matchers.delete(watchId);
                stats.matchCounts.delete(watchId);
                announced.delete(watchId);
                log.info("watch removed from source, dropping match state", {id: watchId});
            }

            activeWatches.set(stats.matchCounts.size);
            currentMatches.set([...stats.matchCounts.values()].reduce((sum, count) => sum + count, 0));
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
