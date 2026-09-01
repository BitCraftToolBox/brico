/**
 * metrics.ts — Prometheus counters/histograms for the bridge worker, served over `http-server.ts`'s
 * existing `/metrics` route.
 */
import {collectDefaultMetrics, Counter, Gauge, Histogram, Registry} from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({register: registry});

/** Time to rebuild a `CraftSnapshot` from prism's relay tables (`relay/prism.ts`'s `readSnapshot`). */
export const snapshotBuildDuration = new Histogram({
    name: "brico_bot_snapshot_build_duration_seconds",
    help: "Time to build a CraftSnapshot from prism's relay tables",
    registers: [registry],
});

/** Time to run every watch's filter against one snapshot (the loop in `bridge.ts`'s `onSnapshot`). */
export const watchEvaluationDuration = new Histogram({
    name: "brico_bot_watch_evaluation_duration_seconds",
    help: "Time to evaluate every watch's filter against one snapshot",
    registers: [registry],
});

/** Time spent resolving + writing bounty assignments for one snapshot (`BountyEngine.assign`). */
export const bountyAssignDuration = new Histogram({
    name: "brico_bot_bounty_assign_duration_seconds",
    help: "Time to resolve and write craft bounty assignments for one snapshot",
    registers: [registry],
});

/** Time spent resolving + writing per-contributor entitlements (`BountyEngine.updateEntitlements`). */
export const bountyEntitlementDuration = new Histogram({
    name: "brico_bot_bounty_entitlement_duration_seconds",
    help: "Time to resolve and write per-contributor bounty entitlements for one snapshot",
    registers: [registry],
});

/** Round-trip duration of a `brico-app` reducer call, by reducer name and outcome. */
export const reducerCallDuration = new Histogram({
    name: "brico_bot_reducer_call_duration_seconds",
    help: "Duration of brico-app reducer calls",
    labelNames: ["reducer", "outcome"] as const,
    registers: [registry],
});

/** Watch filter transitions fired, by kind (`added`/`finished`/`removed`) — cumulative, never reset. */
export const watchMatchesTotal = new Counter({
    name: "brico_bot_watch_matches_total",
    help: "Watch filter transitions fired, by kind",
    labelNames: ["kind"] as const,
    registers: [registry],
});

/** Number of watches evaluated on the most recent snapshot. */
export const activeWatches = new Gauge({
    name: "brico_bot_active_watches",
    help: "Number of watches evaluated on the most recent snapshot",
    registers: [registry],
});

/** Sum of every watch's current match count, as of the most recent snapshot. */
export const currentMatches = new Gauge({
    name: "brico_bot_current_matches",
    help: "Sum of current match counts across all watches, as of the most recent snapshot",
    registers: [registry],
});

/**
 * Times a fire-and-forget reducer call without changing its resolve/reject behavior — callers keep
 * their existing `.catch(...)` chain, this just sits between the reducer call and it.
 */
export function timeReducerCall<T>(reducer: string, call: Promise<T>): Promise<T> {
    const start = performance.now();
    return call.then(
        value => {
            reducerCallDuration.observe({reducer, outcome: "ok"}, (performance.now() - start) / 1000);
            return value;
        },
        error => {
            reducerCallDuration.observe({reducer, outcome: "error"}, (performance.now() - start) / 1000);
            throw error;
        },
    );
}
