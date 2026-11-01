/**
 * effort-history.ts — client-side time series of a craft's effort, sampled for as long as the
 * craft's relay subscription is held.
 *
 * Nothing here is persisted or fetched: the history is lost on reload and when the subscription is dropped.
 */
import {type Accessor, createSignal} from "solid-js";

/** How often the live numbers are snapshotted. */
export const SAMPLE_INTERVAL_MS = 5_000;

/** Oldest samples are dropped past this count (~3 hours at `SAMPLE_INTERVAL_MS`). */
const MAX_SAMPLES = 2_000;

/** Window the completion estimate's moving average spans. */
export const RATE_WINDOW_MS = 10 * 60_000;

/** The shortest span of samples a rate is computed over; shorter than this is mostly noise. */
const MIN_RATE_SPAN_MS = 4 * SAMPLE_INTERVAL_MS;

export interface EffortSample {
    /** Epoch milliseconds the sample was taken at. */
    t: number;
    /** The craft's total effort done, as the craft row reports it. */
    done: number;
    /** Cumulative effort per contributor, keyed by player id. */
    efforts: Record<string, number>;
}

/** What one tick records; `null` skips the tick (not connected, craft not loaded, or craft finished). */
export type EffortReading = Pick<EffortSample, "done" | "efforts"> | null;

interface HistoryEntry {
    samples: Accessor<EffortSample[]>;
    timer: ReturnType<typeof setInterval>;
}

/** Live histories by craft id. Only ever populated in the browser, by `startEffortHistory`. */
const entries = new Map<bigint, HistoryEntry>();
const [registryVersion, bumpRegistry] = createSignal(0);

/**
 * Begins sampling `craftId` every `SAMPLE_INTERVAL_MS` and keeps going until `stopEffortHistory`.
 * A no-op if that craft is already being sampled, so re-entering a craft inside the connection
 * manager's grace period resumes the same history.
 */
export function startEffortHistory(craftId: bigint, read: () => EffortReading): void {
    if (entries.has(craftId)) return;
    const [samples, setSamples] = createSignal<EffortSample[]>([]);
    const timer = setInterval(() => {
        const reading = read();
        if (!reading) return;
        setSamples(prev => {
            const next = [...prev, {t: Date.now(), ...reading}];
            return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
        });
    }, SAMPLE_INTERVAL_MS);
    entries.set(craftId, {samples, timer});
    bumpRegistry(v => v + 1);
}

/** Whether `craftId` is currently being sampled. */
export function hasEffortHistory(craftId: bigint): boolean {
    return entries.has(craftId);
}

/** Stops sampling `craftId` and discards its history. */
export function stopEffortHistory(craftId: bigint): void {
    const entry = entries.get(craftId);
    if (!entry) return;
    clearInterval(entry.timer);
    entries.delete(craftId);
    bumpRegistry(v => v + 1);
}

const NO_SAMPLES: EffortSample[] = [];

/** Reactive samples for `craftId`; empty when it isn't being sampled. */
export function effortSamples(craftId: bigint | null): EffortSample[] {
    registryVersion();
    return (craftId === null ? undefined : entries.get(craftId)?.samples()) ?? NO_SAMPLES;
}

/**
 * Effort per millisecond averaged over the trailing `windowMs` of `samples`, or `null` when the
 * window holds less than `MIN_RATE_SPAN_MS` of data.
 */
export function movingRate(samples: readonly EffortSample[], windowMs: number = RATE_WINDOW_MS): number | null {
    const last = samples.at(-1);
    if (!last) return null;
    const first = samples.find(s => s.t >= last.t - windowMs) ?? last;
    const span = last.t - first.t;
    if (span < MIN_RATE_SPAN_MS) return null;
    return (last.done - first.done) / span;
}

export type CompletionEstimate =
    | {kind: "unknown"}
    | {kind: "stalled"}
    | {kind: "eta"; atMs: number; remainingMs: number; ratePerSecond: number};

/** When the craft finishes if effort keeps arriving at the recent average rate. */
export function estimateCompletion(samples: readonly EffortSample[], effortTotal: number): CompletionEstimate {
    const last = samples.at(-1);
    const rate = movingRate(samples);
    if (!last || rate === null || effortTotal <= 0) return {kind: "unknown"};
    if (rate <= 0) return {kind: "stalled"};
    const remainingMs = Math.max(effortTotal - last.done, 0) / rate;
    return {kind: "eta", atMs: last.t + remainingMs, remainingMs, ratePerSecond: rate * 1000};
}
