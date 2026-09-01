/**
 * bridge.test.ts — the bridge's own wiring, on top of the shared match engine.
 *
 * The added/finished/removed transition logic itself is `@brico/crafts/watch`'s job now, and is
 * pinned there (`common/crafts/watch.test.ts`) against synthetic subjects with no relay or
 * SpacetimeDB types involved. What's left here is specific to this process: that `craftRowsFrom`
 * feeds real relay rows into the shared engine correctly, that each watch id gets its own matcher,
 * and that a watch dropping out of the `WatchSource` discards its match state so it re-primes rather
 * than silently resuming (see the comment at the call site in `bridge.ts`).
 *
 * Run with `npm test` in this workspace (`node --import tsx --test`) — `tsx` rather than bare
 * `node` because the workspace packages export raw `.ts`.
 */
import type {CraftMeta, CraftProgress} from "@brico/bindings/prism/types";
import {openWorkFilter} from "@brico/crafts/filter";
import type {CraftBountyFacts} from "@brico/crafts/subject";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Timestamp} from "spacetimedb";
import type {BountyEngine} from "./app/bounty-sink.ts";
import type {WatchSource} from "./app/watch-source.ts";

import {createBridge, type MatchEvent} from "./bridge.ts";
import type {RecipeIndex, RecipeStatic} from "./game-data/recipes.ts";
import {createLogger} from "./log.ts";
import {type CraftSnapshot, EMPTY_SNAPSHOT} from "./relay/prism.ts";

const RECIPE: RecipeStatic = {
    effortRequired: 100,
    skillId: 3,
    buildingType: 127749503,
    levelRequired: 25,
    itemKey: "item:1150001",
    itemTag: "Basic Food",
    inputItems: [],
};
const RECIPE_ID = 7;
const RECIPES: RecipeIndex = new Map([[RECIPE_ID, RECIPE]]);

function craft(overrides: Partial<CraftMeta> = {}): CraftMeta {
    return {
        entityId: 1n,
        ownerEntityId: 0n,
        claimEntityId: 0n,
        buildingEntityId: 0n,
        firstSeen: Timestamp.UNIX_EPOCH,
        recipeId: RECIPE_ID,
        count: 2,
        regionId: 14,
        public: true,
        status: {tag: "Active"},
        ...overrides,
    } as CraftMeta;
}

function snapshot(crafts: CraftMeta[], progressRows: CraftProgress[] = []): CraftSnapshot {
    return {
        ...EMPTY_SNAPSHOT,
        crafts: crafts.filter(row => row.status.tag === "Active"),
        allCraftIds: new Set(crafts.map(row => row.entityId)),
        progress: new Map(progressRows.map(row => [row.entityId, row])),
        builtAtMs: Date.now(),
    };
}

/** A bridge with a fixed single watch and an event-collecting sink. */
function harness(filter = openWorkFilter()) {
    const events: MatchEvent[] = [];
    const watches: WatchSource = {
        origin: "test",
        watches: () => [{id: "w", name: "test watch", owner: null, filterId: null, triggers: {added: true, finished: true, removed: true}, filter}],
    };
    // `error` silences the bridge's own informational logging without stubbing the logger.
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES});
    return {bridge, events};
}

test("a real relay snapshot primes without emitting events, and reports the right match count", () => {
    const {bridge, events} = harness();
    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(events.length, 0);
    assert.equal(bridge.stats.matchCounts.get("w"), 1);
});

test("a craft appearing after priming is added once, with the bridge's richer CraftRow attached", () => {
    const {bridge, events} = harness();
    bridge.onSnapshot(snapshot([craft()]));
    bridge.onSnapshot(snapshot([craft(), craft({entityId: 2n})]));
    assert.deepEqual(events.map(e => [e.kind, e.craftId]), [["added", "2"]]);
    assert.equal(events[0].watch.id, "w");
    assert.equal(events[0].craft?.recipeId, RECIPE_ID);
});

test("dropping a watch discards its match state so it re-primes", () => {
    const events: MatchEvent[] = [];
    let live = true;
    const watches: WatchSource = {
        origin: "test",
        watches: () => (live ? [{id: "w", name: "test watch", owner: null, filterId: null, triggers: {added: true, finished: true, removed: true}, filter: openWorkFilter()}] : []),
    };
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES});

    bridge.onSnapshot(snapshot([craft()]));
    live = false;
    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(bridge.stats.matchCounts.has("w"), false);

    live = true;
    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(events.length, 0, "a returning watch primes again rather than re-announcing matches");
});

test("bounties are assigned before watches are evaluated in the same tick", () => {
    // A filter on `payout` must see a freshly-assigned bounty in the very tick it's assigned, not
    // the tick after — the design doc's "Notification-ordering requirement".
    const events: MatchEvent[] = [];
    const watches: WatchSource = {
        origin: "test",
        watches: () => [{
            id: "w",
            name: "has a bounty",
            owner: null,
            filterId: null,
            triggers: {added: true, finished: true, removed: true},
            filter: {field: "payout", cmp: "gte", value: 0},
        }],
    };
    const bounty: BountyEngine = {
        assign: () => new Map<bigint, CraftBountyFacts>([[1n, {ratioNumerator: 1n, ratioDenominator: 20n, currency: "hex-coin", private: false}]]),
        updateEntitlements: () => {},
    };
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES, bounty});

    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(bridge.stats.matchCounts.get("w"), 1, "the bounty-carrying craft matches on the very first snapshot");
});
