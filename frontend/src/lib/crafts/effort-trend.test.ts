import assert from "node:assert/strict";
import {test} from "node:test";
import type {EffortSample} from "./effort-history.ts";
import {estimateCompletion, trendProjection} from "./effort-trend.ts";

const sample = (over: Partial<EffortSample> = {}): EffortSample => ({
    t: 1_000_000,
    done: 400,
    efforts: {a: 300, b: 200},
    rate: 0.01,
    instantRate: 0.02,
    players: {},
    ...over,
});

test("a craft that is complete reports complete even with no samples", () => {
    assert.deepEqual(estimateCompletion([], 1000, 1000), {kind: "complete"});
    assert.deepEqual(estimateCompletion([sample()], 1000, 1200), {kind: "complete"});
});

test("no samples or a young unmeasured history is unknown; a zero rate is stalled", () => {
    assert.deepEqual(estimateCompletion([], 1000, 0), {kind: "unknown"});
    assert.deepEqual(estimateCompletion([sample({rate: null})], 1000, 400), {kind: "unknown"});
    assert.deepEqual(estimateCompletion([sample({rate: 0})], 1000, 400), {kind: "stalled"});
});

test("an unmeasured rate is idle once the history is 20 s old, and still collecting before that", () => {
    const young = [sample({t: 1_000_000, rate: null}), sample({t: 1_015_000, rate: null})];
    const old = [sample({t: 1_000_000, rate: null}), sample({t: 1_020_000, rate: null})];
    assert.deepEqual(estimateCompletion(young, 1000, 400), {kind: "unknown"});
    assert.deepEqual(estimateCompletion(old, 1000, 400), {kind: "stalled"});
    assert.equal(trendProjection(young, 1000, 60_000), null);
    assert.equal(trendProjection(old, 1000, 60_000)!.etaT, null);
});

test("the ETA is the remaining effort over the latest rate, from the latest sample", () => {
    const e = estimateCompletion([sample()], 1000, 400);
    assert.deepEqual(e, {kind: "eta", atMs: 1_000_000 + 60_000, remainingMs: 60_000, ratePerSecond: 10});
});

test("the trend line starts on the summed-effort axis and ends where the ETA says", () => {
    const trend = trendProjection([sample()], 1000, 10 * 60_000)!;
    assert.deepEqual(trend.from, {t: 1_000_000, effort: 500});
    assert.equal(trend.target, 1100);
    assert.equal(trend.etaT, 1_060_000);
    assert.deepEqual(trend.to, {t: 1_060_000, effort: 1100});
});

test("the text and the line agree on when the craft finishes", () => {
    const samples = [sample({rate: 0.004, done: 250})];
    const e = estimateCompletion(samples, 1000, 250);
    const trend = trendProjection(samples, 1000, 60 * 60_000)!;
    assert.equal(e.kind, "eta");
    assert.equal(trend.etaT, e.kind === "eta" ? e.atMs : null);
});

test("an ETA past the horizon is cut off without a crossing point", () => {
    const trend = trendProjection([sample({rate: 0.001})], 1000, 60_000)!;
    assert.equal(trend.etaT, null);
    assert.deepEqual(trend.to, {t: 1_060_000, effort: 500 + 0.001 * 60_000});
});

test("a zero rate gives a flat line and no crossing; no rate gives no line", () => {
    const flat = trendProjection([sample({rate: 0})], 1000, 60_000)!;
    assert.equal(flat.etaT, null);
    assert.deepEqual(flat.to, {t: 1_060_000, effort: 500});
    assert.equal(trendProjection([sample({rate: null})], 1000, 60_000), null);
    assert.equal(trendProjection([], 1000, 60_000), null);
});
