import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {type CraftSubject, type FilterNode, matchAll, openWorkFilter} from "./filter.ts";
import {createWatchMatcher, type MatchEvent} from "./watch.ts";

interface Row {
    id: string;
    subject: CraftSubject;
}

function subject(overrides: Partial<CraftSubject> = {}): CraftSubject {
    return {
        region: 14,
        claim: null,
        item: "item:1150001",
        itemTag: null,
        inputItems: [],
        skill: 3,
        tier: 2,
        buildingType: 127749503,
        effortTotal: 200,
        effortRemaining: 200,
        public: true,
        complete: false,
        owner: null,
        ownerClaimAccess: null,
        payout: null,
        currency: null,
        bountyPrivate: false,
        ...overrides,
    };
}

function row(id: string, overrides: Partial<CraftSubject> = {}): Row {
    return {id, subject: subject(overrides)};
}

function done(effortTotal: number, effortRemaining: number) {
    return {effortTotal, effortRemaining, complete: effortRemaining === 0};
}

function kinds(events: MatchEvent<Row>[]): string[] {
    return events.map(e => e.kind);
}

describe("createWatchMatcher", () => {
    it("primes silently on the first snapshot", () => {
        const matcher = createWatchMatcher<Row>();
        const events = matcher.update(openWorkFilter(), [row("1")]);
        assert.deepEqual(events, []);
        assert.equal(matcher.matchCount, 1);
        assert.equal(matcher.primed, true);
    });

    it("reports a newly matching craft as added, and never re-adds a still-matching one", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(openWorkFilter(), [row("1")]);

        const first = matcher.update(openWorkFilter(), [row("1"), row("2")]);
        assert.deepEqual(kinds(first), ["added"]);
        assert.equal(first[0].craftId, "2");

        const second = matcher.update(openWorkFilter(), [row("1"), row("2")]);
        assert.deepEqual(second, []);
    });

    it("fires finished once, on the transition into completeness, for a filter matching complete crafts too", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(matchAll(), [row("1", done(200, 150))]);

        const partial = matcher.update(matchAll(), [row("1", done(200, 50))]);
        assert.deepEqual(partial, [], "partial progress is not an event");

        const finished = matcher.update(matchAll(), [row("1", done(200, 0))]);
        assert.deepEqual(kinds(finished), ["finished"]);

        const stillComplete = matcher.update(matchAll(), [row("1", done(200, 0))]);
        assert.deepEqual(stillComplete, [], "completeness is a one-shot transition");
    });

    it("fires finished (not removed) for a filter that excludes complete crafts by construction", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(openWorkFilter(), [row("1", done(200, 150))]);

        const events = matcher.update(openWorkFilter(), [row("1", done(200, 0))]);
        assert.deepEqual(kinds(events), ["finished"]);
        assert.equal(events[0].craft?.subject.complete, true);
    });

    it("reports a craft that disappears from the snapshot as removed, carrying its last-known row", () => {
        const matcher = createWatchMatcher<Row>();
        const seen = row("1");
        matcher.update(openWorkFilter(), [seen]);

        const events = matcher.update(openWorkFilter(), []);
        assert.deepEqual(kinds(events), ["removed"]);
        assert.equal(events[0].craft, seen, "the row is gone from the snapshot, so the last-seen one is used");
    });

    it("reports a craft that stops matching for a reason unrelated to completing as removed", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(openWorkFilter(), [row("1")]);

        const events = matcher.update(openWorkFilter(), [row("1", {public: false})]);
        assert.deepEqual(kinds(events), ["removed"]);
        assert.equal(events[0].craft?.id, "1", "the craft is still in the snapshot, just not matching");
    });

    it("reports removed, not finished, when a craft finishes and stops matching for another reason at once", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(openWorkFilter(), [row("1", done(200, 150))]);

        const events = matcher.update(openWorkFilter(), [row("1", {...done(200, 0), public: false})]);
        assert.deepEqual(kinds(events), ["removed"]);
    });

    it("re-evaluates against whatever filter is passed each call, not one fixed at construction", () => {
        const matcher = createWatchMatcher<Row>();
        matcher.update(openWorkFilter(), [row("1")]);

        // Same watch id, filter edited to exclude region 14 — must take effect immediately.
        const excluded: FilterNode = {field: "region", cmp: "eq", value: 99};
        const events = matcher.update(excluded, [row("1")]);
        assert.deepEqual(kinds(events), ["removed"]);
        assert.equal(matcher.matchCount, 0);
    });
});
