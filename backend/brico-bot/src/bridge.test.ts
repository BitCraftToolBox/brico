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
import {type FilterNode, openWorkFilter} from "@brico/crafts/filter";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Timestamp} from "spacetimedb";
import type {BountyEngine} from "./app/bounty-sink.ts";
import type {WatchSource} from "./app/watch-source.ts";

import {createBridge, type MatchEvent} from "./bridge.ts";
import type {RecipeIndex, RecipeStatic} from "./game-data/recipes.ts";
import {createLogger} from "./log.ts";
import {type CraftSnapshot, EMPTY_SNAPSHOT} from "./relay/prism.ts";
import {createRowCache} from "./relay/row-cache.ts";
import type {AssignedBounty} from "./relay/subject.ts";

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
        assign: () => new Map<bigint, AssignedBounty>([[1n, {ratioNumerator: 1n, ratioDenominator: 20n, currency: "hex-coin", private: false, assignedByAccountIdentity: {toHexString: () => "owner-hex"}}]]),
        updateEntitlements: () => {},
        resyncLoyaltyBonuses: () => {},
        markMembershipChanged: () => {},
        markLoyaltyRulesChanged: () => {},
    };
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES, bounty});

    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(bridge.stats.matchCounts.get("w"), 1, "the bounty-carrying craft matches on the very first snapshot");
});

test("resyncLoyaltyBonuses is called every tick, alongside assign/updateEntitlements", () => {
    // `bridge.ts` doesn't gate this call itself — `BountyEngine.resyncLoyaltyBonuses` is expected to
    // no-op internally unless a resync is actually pending (see bounty-sink.test.ts for that gating).
    // This only asserts the bridge wires the call through on every snapshot.
    let resyncCalls = 0;
    const watches: WatchSource = {origin: "test", watches: () => []};
    const bounty: BountyEngine = {
        assign: () => new Map(),
        updateEntitlements: () => {},
        resyncLoyaltyBonuses: () => {
            resyncCalls += 1;
        },
        markMembershipChanged: () => {},
        markLoyaltyRulesChanged: () => {},
    };
    const bridge = createBridge({log: createLogger("error"), watches, sink: () => {}, recipes: RECIPES, bounty});

    bridge.onSnapshot(snapshot([craft()]));
    bridge.onSnapshot(snapshot([craft()]));
    assert.equal(resyncCalls, 2);
});

test("a private bounty is invisible to every watch but its assigner's", () => {
    const hasBounty: FilterNode = {field: "payout", cmp: "gte", value: 0};
    const spec = (id: string, owner: string | null) => ({id, name: id, owner, filterId: null, triggers: {added: true, finished: true, removed: true}, filter: hasBounty});
    const watches: WatchSource = {origin: "test", watches: () => [spec("assigner", "owner-hex"), spec("other", "other-hex"), spec("ownerless", null)]};
    const bountied = new Map<bigint, AssignedBounty>();
    const bounty: BountyEngine = {
        assign: () => bountied,
        updateEntitlements: () => {},
        resyncLoyaltyBonuses: () => {},
        markMembershipChanged: () => {},
        markLoyaltyRulesChanged: () => {},
    };
    const events: MatchEvent[] = [];
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES, bounty});

    bridge.onSnapshot(snapshot([craft()]));
    bountied.set(1n, {ratioNumerator: 1n, ratioDenominator: 20n, currency: "hex-coin", private: true, assignedByAccountIdentity: {toHexString: () => "owner-hex"}});
    bridge.onSnapshot(snapshot([craft()]));

    assert.deepEqual(events.map(e => [e.watch.id, e.kind]), [["assigner", "added"]]);
    assert.equal(events[0].craft?.subject.payout, 0.05);
    assert.equal(bridge.stats.matchCounts.get("other"), 0);
    assert.equal(bridge.stats.matchCounts.get("ownerless"), 0);
});

test("a tick over cache changes reports only what those changes caused, and an edited filter re-evaluates every craft", () => {
    const events: MatchEvent[] = [];
    let filter: FilterNode = openWorkFilter();
    const watches: WatchSource = {
        origin: "test",
        watches: () => [{id: "w", name: "test watch", owner: null, filterId: null, triggers: {added: true, finished: true, removed: true}, filter}],
    };
    const cache = createRowCache(RECIPES);
    const bridge = createBridge({log: createLogger("error"), watches, sink: event => void events.push(event), recipes: RECIPES, cache});

    bridge.onSnapshot(snapshot([craft()]));
    cache.craftMeta.insert(craft({entityId: 2n}));
    bridge.onTick();
    assert.deepEqual(events.map(e => [e.kind, e.craftId]), [["added", "2"]]);

    bridge.onTick();
    assert.equal(events.length, 1, "a tick with nothing changed reports nothing");

    cache.craftMeta.update(craft({entityId: 2n}), craft({entityId: 2n, status: {tag: "Claimed"}} as Partial<CraftMeta>));
    bridge.onTick();
    assert.deepEqual(events.slice(1).map(e => [e.kind, e.craftId]), [["removed", "2"]]);

    filter = {field: "region", cmp: "eq", value: 999};
    bridge.onTick();
    assert.deepEqual(events.slice(2).map(e => [e.kind, e.craftId]), [["removed", "1"]]);
    assert.equal(bridge.stats.matchCounts.get("w"), 0);
});
