/**
 * effort-history.ts — client-side time series of a craft's effort, sampled for as long as the
 * craft's relay subscription is held, with the rate estimate taken at each sample.
 *
 * Nothing here is persisted or fetched: the history is lost on reload and when the subscription is dropped.
 */
import {PlayerActivityModel, type PlayerPhase} from "@brico/crafts/effort-rate";
import {type Accessor, createSignal} from "solid-js";

/** How often the live numbers are snapshotted. */
export const SAMPLE_INTERVAL_MS = 5_000;

/** Oldest samples are dropped past this count (~3 hours at `SAMPLE_INTERVAL_MS`). */
const MAX_SAMPLES = 2_000;

export interface SamplePlayer {
    phase: PlayerPhase;
    /** Effort per millisecond this player is expected to add, rests included; 0 unless active or resting. */
    expectedRate: number;
}

export interface EffortSample {
    /** Epoch milliseconds the sample was taken at. */
    t: number;
    /** The craft's total effort done, as the craft row reports it. */
    done: number;
    /** Cumulative effort per contributor, keyed by player id. */
    efforts: Record<string, number>;
    /** Expected effort per millisecond from now on; `null` until a player has been measured. 0 means nobody is working. */
    rate: number | null;
    /** Effort per millisecond from the players hitting at this moment, ignoring rests; bumpy by design. */
    instantRate: number;
    /** Each contributor's state at this sample. */
    players: Record<string, SamplePlayer>;
}

/** What one tick records; `null` skips the tick (not connected, craft not loaded, or craft finished). */
export type EffortReading = Pick<EffortSample, "done" | "efforts"> | null;

interface HistoryEntry {
    samples: Accessor<EffortSample[]>;
    timer: ReturnType<typeof setInterval>;
    /** Sees every relay update, not just the sampled ones. */
    model: PlayerActivityModel;
}

/** Live histories by craft id. Only ever populated in the browser, by `startEffortHistory`. */
const entries = new Map<bigint, HistoryEntry>();
const [registryVersion, bumpRegistry] = createSignal(0);

function takeSample(entry: HistoryEntry, t: number, reading: NonNullable<EffortReading>): EffortSample {
    const observation = {t, ...reading};
    entry.model.observe(observation);
    const players: Record<string, SamplePlayer> = {};
    for (const {id, phase, expectedRate} of entry.model.activity()) players[id] = {phase, expectedRate};
    return {
        t,
        ...reading,
        rate: entry.model.rate(),
        instantRate: entry.model.instantaneousRate(),
        players,
    };
}

/**
 * Begins sampling `craftId` every `SAMPLE_INTERVAL_MS` and keeps going until `stopEffortHistory`.
 * A no-op if that craft is already being sampled, so re-entering a craft inside the connection
 * manager's grace period resumes the same history.
 */
export function startEffortHistory(craftId: bigint, read: () => EffortReading): void {
    if (entries.has(craftId)) return;
    const [samples, setSamples] = createSignal<EffortSample[]>([]);
    const entry: HistoryEntry = {
        samples,
        model: new PlayerActivityModel(),
        timer: setInterval(() => {
            const reading = read();
            if (!reading) return;
            const sample = takeSample(entry, Date.now(), reading);
            setSamples(prev => {
                const next = [...prev, sample];
                return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
            });
        }, SAMPLE_INTERVAL_MS),
    };
    entries.set(craftId, entry);
    bumpRegistry(v => v + 1);
}

/**
 * Feeds a relay update to the craft's rate model between samples; the model needs every
 * contribution change to time players' hits, which the 5 s samples alone would miss. A no-op
 * when the craft isn't being sampled.
 */
export function observeEffort(craftId: bigint, reading: EffortReading): void {
    const entry = entries.get(craftId);
    if (entry && reading) entry.model.observe({t: Date.now(), ...reading});
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
