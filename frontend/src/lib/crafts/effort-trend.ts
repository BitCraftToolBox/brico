/**
 * effort-trend.ts — turns effort samples into the craft's completion estimate and the chart's trend line.
 *
 * Both read the same latest sample's rate and `done`, so the text and the line cross at the same moment.
 */
import type {EffortSample} from "~/lib/crafts/effort-history";

export type CompletionEstimate =
    | {kind: "unknown"}
    | {kind: "complete"}
    | {kind: "stalled"}
    | {kind: "eta"; atMs: number; remainingMs: number; ratePerSecond: number};

/** Observed history after which a rate that is still unmeasured means nobody is working, rather than that data is still arriving. */
const NO_PROGRESS_AFTER_MS = 20_000;

/** The latest sample's expected rate per millisecond; 0 once the history is old enough that "unmeasured" means idle; `null` while still collecting. */
function expectedRate(samples: readonly EffortSample[]): number | null {
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last) return null;
    return last.rate ?? (last.t - first.t >= NO_PROGRESS_AFTER_MS ? 0 : null);
}

/** When the craft finishes if effort keeps arriving at the latest sample's expected rate. */
export function estimateCompletion(samples: readonly EffortSample[], effortTotal: number, effortDone: number): CompletionEstimate {
    if (effortTotal > 0 && effortDone >= effortTotal) return {kind: "complete"};
    const last = samples.at(-1);
    const rate = expectedRate(samples);
    if (!last || rate === null || effortTotal <= 0) return {kind: "unknown"};
    if (rate <= 0) return {kind: "stalled"};
    const remainingMs = Math.max(effortTotal - last.done, 0) / rate;
    return {kind: "eta", atMs: last.t + remainingMs, remainingMs, ratePerSecond: rate * 1000};
}

export interface TrendProjection {
    /** Where the line starts: the latest sample, on the contributors' summed-effort axis. */
    from: {t: number; effort: number};
    /** Where the line ends: at the completion level, or `maxHorizonMs` after `from` if that comes first. */
    to: {t: number; effort: number};
    /** The summed-effort level at which the craft is complete. */
    target: number;
    /** When the line reaches `target`; `null` if that is beyond `maxHorizonMs` or the rate is zero. */
    etaT: number | null;
}

/** The expected-rate line from the latest sample forward; `null` while there is no rate. */
export function trendProjection(samples: readonly EffortSample[], effortTotal: number, maxHorizonMs: number): TrendProjection | null {
    const last = samples.at(-1);
    const rate = expectedRate(samples);
    if (!last || rate === null || effortTotal <= 0) return null;
    let sum = 0;
    for (const effort of Object.values(last.efforts)) sum += effort;
    const remaining = Math.max(effortTotal - last.done, 0);
    const etaMs = rate > 0 ? remaining / rate : null;
    const reaches = etaMs !== null && etaMs <= maxHorizonMs;
    const horizonMs = reaches ? etaMs : maxHorizonMs;
    return {
        from: {t: last.t, effort: sum},
        to: {t: last.t + horizonMs, effort: sum + rate * horizonMs},
        target: sum + remaining,
        etaT: reaches ? last.t + etaMs : null,
    };
}
