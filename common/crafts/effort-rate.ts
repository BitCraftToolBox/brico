/**
 * effort-rate.ts — incremental estimators of how fast a craft's effort is arriving, and so when it finishes.
 *
 * Feed `EffortObservation`s in time order, read `rate()` whenever. Every estimator reports
 * effort per millisecond. Nothing here retains the observation's `efforts` object.
 */

export interface EffortObservation {
    /** Epoch milliseconds. */
    t: number;
    /** The craft's total effort done. */
    done: number;
    /** Cumulative effort per contributor, keyed by player id. */
    efforts: Readonly<Record<string, number>>;
}

export interface RateEstimator {
    observe(observation: EffortObservation): void;
    /** Expected effort per millisecond from now on; `null` while there is too little data to say. */
    rate(): number | null;
}

/** Observations closer together than this are dropped by the windowed estimators; matches the chart's sampling cadence. */
const DEFAULT_SAMPLE_MS = 5_000;

/** A windowed rate needs at least this many sample intervals of data; less is mostly noise. */
const MIN_SPAN_SAMPLES = 4;

export interface WindowOptions {
    windowMs: number;
    sampleMs?: number;
}

/** The trailing `windowMs` of `done`, thinned to one point per `sampleMs`. */
class SampleWindow {
    readonly points: {t: number; done: number}[] = [];
    private readonly windowMs: number;
    readonly sampleMs: number;

    constructor(windowMs: number, sampleMs: number) {
        this.windowMs = windowMs;
        this.sampleMs = sampleMs;
    }

    add({t, done}: EffortObservation): void {
        const last = this.points.at(-1);
        if (last && t - last.t < this.sampleMs) return;
        this.points.push({t, done});
        const cutoff = t - this.windowMs;
        let stale = 0;
        while (stale < this.points.length && this.points[stale].t < cutoff) stale++;
        if (stale > 0) this.points.splice(0, stale);
    }

    /** The points to fit, or `null` when they span less than `MIN_SPAN_SAMPLES` intervals. */
    usable(): readonly {t: number; done: number}[] | null {
        const first = this.points[0];
        const last = this.points.at(-1);
        return first && last && last.t - first.t >= MIN_SPAN_SAMPLES * this.sampleMs ? this.points : null;
    }
}

/** Effort gained between the window's first and last point over the time between them. */
export function endpointRateEstimator({windowMs, sampleMs = DEFAULT_SAMPLE_MS}: WindowOptions): RateEstimator {
    const window = new SampleWindow(windowMs, sampleMs);
    return {
        observe: observation => window.add(observation),
        rate() {
            const points = window.usable();
            if (!points) return null;
            const first = points[0];
            const last = points[points.length - 1];
            return (last.done - first.done) / (last.t - first.t);
        },
    };
}

/** Least-squares slope of `done` against time over the window; uses every point, so a pause at either end moves it less than the endpoint difference does. */
export function slopeRateEstimator({windowMs, sampleMs = DEFAULT_SAMPLE_MS}: WindowOptions): RateEstimator {
    const window = new SampleWindow(windowMs, sampleMs);
    return {
        observe: observation => window.add(observation),
        rate() {
            const points = window.usable();
            if (!points) return null;
            const t0 = points[0].t;
            let sumT = 0;
            let sumD = 0;
            for (const p of points) {
                sumT += p.t - t0;
                sumD += p.done;
            }
            const meanT = sumT / points.length;
            const meanD = sumD / points.length;
            let sxx = 0;
            let sxy = 0;
            for (const p of points) {
                sxx += (p.t - t0 - meanT) ** 2;
                sxy += (p.t - t0 - meanT) * (p.done - meanD);
            }
            return sxy / sxx;
        },
    };
}

export interface DecayedOptions {
    /** Effort older than this contributes half as much. */
    halfLifeMs: number;
    /** Observed time needed before a rate is reported. */
    minSpanMs?: number;
}

/** Exponentially weighted rate: decayed effort gained over decayed time elapsed, so irregular spacing needs no correction and there is no window edge. */
export function decayedRateEstimator({halfLifeMs, minSpanMs = 20_000}: DecayedOptions): RateEstimator {
    let prev: {t: number; done: number} | null = null;
    let gained = 0;
    let elapsed = 0;
    return {
        observe({t, done}) {
            if (prev && t > prev.t) {
                const decay = 2 ** (-(t - prev.t) / halfLifeMs);
                gained = gained * decay + Math.max(done - prev.done, 0);
                elapsed = elapsed * decay + (t - prev.t);
            }
            prev = {t, done};
        },
        rate: () => (elapsed < minSpanMs ? null : gained / elapsed),
    };
}

export interface ActivityParams {
    /** A player has paused once this many of their own typical hit gaps pass without effort. */
    pauseMultiple: number;
    minPauseMs: number;
    maxPauseMs: number;
    /** Silence beyond max(`goneFloorMs`, `goneRestMultiple` × the player's mean rest) means they left, not rested. */
    goneFloorMs: number;
    goneRestMultiple: number;
    /** Half-life of a player's accumulated run and rest history. */
    memoryMs: number;
    /** Active time a player needs before their rate counts. */
    minActiveMs: number;
    /** Duty cycle assumed before a player's own rests are known, and the active-time weight of that assumption. */
    dutyPrior: number;
    dutyPriorMs: number;
    /** Hit gap assumed until one has been measured. */
    initialTickMs: number;
}

export const DEFAULT_ACTIVITY_PARAMS: ActivityParams = {
    pauseMultiple: 8,
    minPauseMs: 6_000,
    maxPauseMs: 60_000,
    goneFloorMs: 90_000,
    goneRestMultiple: 3,
    memoryMs: 30 * 60_000,
    minActiveMs: 10_000,
    dutyPrior: 0.9,
    dutyPriorMs: 5 * 60_000,
    initialTickMs: 1_500,
};

/** `new` has not gained effort since first seen; `active` is mid-run; `resting` has paused within their usual rests; `gone` has been silent too long to be resting. */
export type PlayerPhase = "new" | "active" | "resting" | "gone";

export interface PlayerActivity {
    id: string;
    phase: PlayerPhase;
    /** Effort per millisecond while hitting; `null` until enough active time has been seen. */
    activeRate: number | null;
    /** Share of a present player's time spent hitting rather than resting. */
    duty: number;
    /** `activeRate × duty` for an `active` or `resting` player; 0 otherwise. */
    expectedRate: number;
}

interface TrackedPlayer {
    effort: number;
    lastGainT: number | null;
    /** Smoothed gap between consecutive gains within a run. */
    tickMs: number | null;
    activeEffort: number;
    activeMs: number;
    restMs: number;
    restCount: number;
}

/**
 * Models each contributor as alternating runs and rests, and sums their expected rates.
 *
 * Each player's rate is measured over their own runs only, and their share of time spent running
 * is learned from their own rests, so a pause neither dips the estimate nor needs a long window.
 * Joins count once a player has run for `minActiveMs`; a leave counts once the silence can no
 * longer be one of the player's usual rests. Before a player's first gain is seen, the effort they
 * arrived with is only a baseline.
 */
export class PlayerActivityModel implements RateEstimator {
    private readonly params: ActivityParams;
    private readonly players = new Map<string, TrackedPlayer>();
    private now: number | null = null;

    constructor(params: Partial<ActivityParams> = {}) {
        this.params = {...DEFAULT_ACTIVITY_PARAMS, ...params};
    }

    observe({t, efforts}: EffortObservation): void {
        if (this.now !== null && t > this.now) this.decay(t - this.now);
        this.now = Math.max(t, this.now ?? t);
        for (const id in efforts) {
            const effort = efforts[id];
            const player = this.players.get(id);
            if (!player) {
                this.players.set(id, {effort, lastGainT: null, tickMs: null, activeEffort: 0, activeMs: 0, restMs: 0, restCount: 0});
                continue;
            }
            if (effort > player.effort) this.gain(player, t, effort - player.effort);
            player.effort = effort;
        }
    }

    rate(): number | null {
        let total = 0;
        let measured = false;
        for (const player of this.players.values()) {
            const activeRate = this.activeRateOf(player);
            if (activeRate === null) continue;
            measured = true;
            const phase = this.phaseOf(player);
            if (phase === "active" || phase === "resting") total += activeRate * this.dutyOf(player);
        }
        return measured ? total : null;
    }

    /** What the players hitting right now add up to, ignoring rests: the bumpy "instantaneous" rate. */
    instantaneousRate(): number {
        let total = 0;
        for (const player of this.players.values()) {
            if (this.phaseOf(player) === "active") total += this.activeRateOf(player) ?? 0;
        }
        return total;
    }

    activity(): PlayerActivity[] {
        return [...this.players].map(([id, player]) => {
            const phase = this.phaseOf(player);
            const activeRate = this.activeRateOf(player);
            const duty = this.dutyOf(player);
            const present = phase === "active" || phase === "resting";
            return {id, phase, activeRate, duty, expectedRate: present && activeRate !== null ? activeRate * duty : 0};
        });
    }

    private decay(dtMs: number): void {
        const factor = 2 ** (-dtMs / this.params.memoryMs);
        for (const player of this.players.values()) {
            player.activeEffort *= factor;
            player.activeMs *= factor;
            player.restMs *= factor;
            player.restCount *= factor;
        }
    }

    /** Classifies the gap since the player's previous gain as part of a run, a rest, or an absence (which is not recorded). */
    private gain(player: TrackedPlayer, t: number, amount: number): void {
        if (player.lastGainT !== null) {
            const gap = t - player.lastGainT;
            if (gap <= this.pauseMs(player)) {
                player.activeEffort += amount;
                player.activeMs += gap;
                player.tickMs = player.tickMs === null ? gap : 0.9 * player.tickMs + 0.1 * gap;
            } else if (gap <= this.goneMs(player)) {
                player.restMs += gap;
                player.restCount += 1;
            }
        }
        player.lastGainT = t;
    }

    private pauseMs(player: TrackedPlayer): number {
        const {pauseMultiple, minPauseMs, maxPauseMs, initialTickMs} = this.params;
        return Math.min(Math.max(pauseMultiple * (player.tickMs ?? initialTickMs), minPauseMs), maxPauseMs);
    }

    private goneMs(player: TrackedPlayer): number {
        const {goneFloorMs, goneRestMultiple} = this.params;
        const meanRest = player.restCount > 0.5 ? player.restMs / player.restCount : 0;
        return Math.max(goneFloorMs, goneRestMultiple * meanRest, this.pauseMs(player));
    }

    private phaseOf(player: TrackedPlayer): PlayerPhase {
        if (player.lastGainT === null || this.now === null) return "new";
        const silence = this.now - player.lastGainT;
        if (silence > this.goneMs(player)) return "gone";
        return silence > this.pauseMs(player) ? "resting" : "active";
    }

    private activeRateOf(player: TrackedPlayer): number | null {
        return player.activeMs >= this.params.minActiveMs ? player.activeEffort / player.activeMs : null;
    }

    private dutyOf(player: TrackedPlayer): number {
        const {dutyPrior, dutyPriorMs} = this.params;
        return (player.activeMs + dutyPrior * dutyPriorMs) / (player.activeMs + player.restMs + dutyPriorMs);
    }
}
