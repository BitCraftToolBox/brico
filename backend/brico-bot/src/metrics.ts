/**
 * metrics.ts — Prometheus counters/histograms for the bridge worker, served over `http-server.ts`'s
 * existing `/metrics` route.
 */
import {collectDefaultMetrics, Counter, Gauge, Histogram, Registry} from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({register: registry});

/** Sub-millisecond to one-second buckets; the per-tick work is mostly a few milliseconds. */
const FINE_BUCKETS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];

/** Time to read prism's relay tables into the row cache when a subscription applies (`relay/prism.ts`'s `readSnapshot`). */
export const snapshotBuildDuration = new Histogram({
    name: "brico_bot_snapshot_build_duration_seconds",
    help: "Time to read prism's relay tables into the row cache",
    registers: [registry],
});

/** Times the row cache disagreed with a full read of the relay tables during reconciliation. */
export const relayDriftTotal = new Counter({
    name: "brico_bot_relay_drift_total",
    help: "Reconciliations that found the row cache differing from a full read of the relay tables",
    registers: [registry],
});

/** Crafts whose rows changed in one tick (the rows the watch matchers re-evaluated). */
export const dirtyCraftsPerTick = new Histogram({
    name: "brico_bot_dirty_crafts_per_tick",
    help: "Crafts whose row changed since the previous tick",
    buckets: [0, 1, 5, 10, 25, 50, 100, 150, 250, 500, 1000, 5000, 20000],
    registers: [registry],
});

/** Time to run every watch's filter against one snapshot (the loop in `bridge.ts`'s `tick`). */
export const watchEvaluationDuration = new Histogram({
    name: "brico_bot_watch_evaluation_duration_seconds",
    help: "Time to evaluate every watch's filter against the crafts that changed in one tick",
    buckets: FINE_BUCKETS,
    registers: [registry],
});

/** Time spent resolving + writing bounty assignments for one snapshot (`BountyEngine.assign`). */
export const bountyAssignDuration = new Histogram({
    name: "brico_bot_bounty_assign_duration_seconds",
    help: "Time to resolve and write craft bounty assignments for one tick",
    buckets: FINE_BUCKETS,
    registers: [registry],
});

/** Time spent resolving + writing per-contributor entitlements (`BountyEngine.updateEntitlements`). */
export const bountyEntitlementDuration = new Histogram({
    name: "brico_bot_bounty_entitlement_duration_seconds",
    help: "Time to resolve and write per-contributor bounty entitlements for one tick",
    buckets: FINE_BUCKETS,
    registers: [registry],
});

/** Time spent in one named step of the per-snapshot pipeline (`bridge.ts`, `bounty-sink.ts`). */
export const tickStepDuration = new Histogram({
    name: "brico_bot_tick_step_duration_seconds",
    help: "Time spent in one step of the per-snapshot pipeline",
    labelNames: ["step"] as const,
    buckets: FINE_BUCKETS,
    registers: [registry],
});

/** Starts a `tickStepDuration` timer for `step`; call the returned function to stop it. */
export function startStep(step: string): () => void {
    const stop = tickStepDuration.startTimer({step});
    return () => void stop();
}

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

/** Notifications handed to a sink, by sink (`toast`/`discord`), transition kind and outcome (`ok`, `failed`, `dropped`, `detached`). */
export const notificationsTotal = new Counter({
    name: "brico_bot_notifications_total",
    help: "Notifications sent to a sink, by sink, kind and outcome",
    labelNames: ["sink", "kind", "outcome"] as const,
    registers: [registry],
});

/** `/watch display` messages currently being kept in sync. */
export const activeDisplays = new Gauge({
    name: "brico_bot_active_displays",
    help: "Live Discord watch displays",
    registers: [registry],
});

/** Distinct saved filters those displays evaluate — includes filters that were deleted but are still displayed. */
export const displayFilters = new Gauge({
    name: "brico_bot_display_filters",
    help: "Distinct saved filters evaluated by live Discord watch displays",
    registers: [registry],
});

/** Display refreshes by outcome: `edited`, `posted`, `skipped` (filter gone or invalid), `failed`, `detached` (channel no longer accessible). */
export const displayUpdatesTotal = new Counter({
    name: "brico_bot_display_updates_total",
    help: "Discord watch display refreshes by outcome",
    labelNames: ["outcome"] as const,
    registers: [registry],
});

/** Time to select and render one display's rows (filter evaluation over every open craft plus formatting), excluding the Discord call. */
export const displayRenderDuration = new Histogram({
    name: "brico_bot_display_render_duration_seconds",
    help: "Time to select and render one Discord watch display's rows",
    buckets: FINE_BUCKETS,
    registers: [registry],
});

/** Slash command invocations by command path (e.g. `watch.display`), context (`guild` or `dm`), and result (`ok` or `error`). */
export const commandInvocationsTotal = new Counter({
    name: "brico_bot_command_invocations_total",
    help: "Slash command invocations by command and context",
    labelNames: ["command", "context", "result"] as const,
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
