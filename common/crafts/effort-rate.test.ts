import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {decayedRateEstimator, type EffortObservation, endpointRateEstimator, PlayerActivityModel, type RateEstimator, slopeRateEstimator,} from "./effort-rate.ts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** Feeds `estimator` one observation per `stepMs` from `fromMs` to `untilMs`, with each player's effort given by `efforts(t)`. */
function run(estimator: RateEstimator, untilMs: number, efforts: (t: number) => Record<string, number>, fromMs = 0, stepMs = 500): void {
    for (let t = fromMs; t <= untilMs; t += stepMs) {
        const values = efforts(t);
        const observation: EffortObservation = {t, done: Object.values(values).reduce((a, b) => a + b, 0), efforts: values};
        estimator.observe(observation);
    }
}

/** A player hitting for `perHit` every `tickMs` between `from` and `to`, holding steady outside. */
function hitter(from: number, to: number, tickMs: number, perHit: number) {
    return (t: number) => perHit * Math.floor((Math.min(Math.max(t, from), to) - from) / tickMs);
}

describe("windowed estimators", () => {
    it("recover the slope of a linear trace", () => {
        const linear = (t: number) => ({a: t * 0.002});
        for (const estimator of [endpointRateEstimator({windowMs: 5 * MINUTE}), slopeRateEstimator({windowMs: 5 * MINUTE})]) {
            run(estimator, 10 * MINUTE, linear);
            assert.ok(Math.abs(estimator.rate()! - 0.002) < 1e-9);
        }
    });

    it("report nothing until the window spans enough samples", () => {
        const estimator = slopeRateEstimator({windowMs: 5 * MINUTE});
        run(estimator, 10 * SECOND, t => ({a: t}));
        assert.equal(estimator.rate(), null);
    });
});

describe("decayedRateEstimator", () => {
    it("settles on a constant rate and follows a step change", () => {
        const estimator = decayedRateEstimator({halfLifeMs: MINUTE});
        run(estimator, 5 * MINUTE, t => ({a: t * 0.001}));
        assert.ok(Math.abs(estimator.rate()! - 0.001) < 1e-9);
        run(estimator, 15 * MINUTE, () => ({a: 5 * MINUTE * 0.001}), 5 * MINUTE + 500);
        assert.ok(estimator.rate()! < 0.00001);
    });
});

describe("PlayerActivityModel", () => {
    // 1 effort per second, so 0.001 effort/ms while hitting.
    const solo = (to: number) => (t: number) => ({a: hitter(0, to, SECOND, 1)(t)});

    it("measures a steady player's rate over their runs", () => {
        const model = new PlayerActivityModel();
        run(model, 5 * MINUTE, solo(10 * MINUTE));
        assert.ok(Math.abs(model.instantaneousRate() - 0.001) < 1e-6);
        // Duty is shrunk toward the prior, so the expected rate sits just under the active rate.
        assert.ok(model.rate()! > 0.0009 && model.rate()! <= 0.001);
    });

    it("holds the expected rate steady through a pause and drops it once the player is gone", () => {
        const model = new PlayerActivityModel();
        const efforts = solo(5 * MINUTE);
        run(model, 5 * MINUTE, efforts);
        const steady = model.rate()!;

        const after = (extraMs: number) => {
            for (let t = 5 * MINUTE + 500; t <= 5 * MINUTE + extraMs; t += 500) model.observe({t, done: 300, efforts: {a: 300}});
        };
        after(20 * SECOND);
        assert.equal(model.activity()[0].phase, "resting");
        // Only the slow memory decay moves it.
        assert.ok(Math.abs(model.rate()! - steady) / steady < 0.01);
        assert.equal(model.instantaneousRate(), 0);

        after(3 * MINUTE);
        assert.equal(model.activity()[0].phase, "gone");
        assert.equal(model.rate(), 0);
    });

    it("sums players, counting a joiner once they have run long enough", () => {
        const model = new PlayerActivityModel();
        run(model, 5 * MINUTE, t => ({a: hitter(0, 10 * MINUTE, SECOND, 1)(t), b: hitter(2 * MINUTE, 10 * MINUTE, 500, 1)(t)}));
        // a: 0.001/ms, b: 0.002/ms.
        assert.ok(Math.abs(model.instantaneousRate() - 0.003) < 1e-5);
    });

    it("does not count effort a player arrived with", () => {
        const model = new PlayerActivityModel();
        run(model, 2 * MINUTE, () => ({a: 5_000}));
        assert.equal(model.rate(), null);
    });

    it("treats a long absence as neither a rest nor a loss of the player's rate", () => {
        const model = new PlayerActivityModel();
        const efforts = (t: number) => ({a: hitter(0, 2 * MINUTE, SECOND, 1)(t) + hitter(30 * MINUTE, 40 * MINUTE, SECOND, 1)(t)});
        run(model, 33 * MINUTE, efforts);
        const [player] = model.activity();
        assert.equal(player.phase, "active");
        assert.ok(player.duty > 0.9);
    });
});
