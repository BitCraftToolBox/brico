/**
 * row-cache.test.ts — random relay row operations applied to a fake relay, checking the incremental
 * row cache + `applyDelta` against the full path (`readSnapshot` + `craftRowsFrom` + `applyBounties`
 * + `update`) after every batch.
 */
import type {DbConnection} from "@brico/bindings/prism";
import type {ClaimInfo, ClaimMember, CraftMeta, CraftProgress, PlayerState, Region} from "@brico/bindings/prism/types";
import {type FilterNode, matchAll, openWorkFilter} from "@brico/crafts/filter";
import {createWatchMatcher, type MatchEvent} from "@brico/crafts/watch";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Timestamp} from "spacetimedb";
import {compiledFilter} from "../compiled-filter.ts";

import type {RecipeIndex, RecipeStatic} from "../game-data/recipes.ts";
import {readSnapshot} from "./prism.ts";
import {createRowCache, findDrift, type TableFeed} from "./row-cache.ts";
import {applyBounties, type AssignedBounty, type CraftRow, craftRowsFrom, rowFor} from "./subject.ts";

function rng(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

const RECIPES: RecipeIndex = new Map<number, RecipeStatic>([
    [1, {effortRequired: 100, skillId: 3, buildingType: 10, levelRequired: 25, itemKey: "item:1", itemTag: "Food", inputItems: [{key: "item:5", tag: "Grain"}]}],
    [2, {effortRequired: 40, skillId: 4, buildingType: 11, levelRequired: 5, itemKey: "cargo:2", itemTag: null, inputItems: []}],
    [3, {effortRequired: 300, skillId: 3, buildingType: 10, levelRequired: 45, itemKey: "item:3", itemTag: "Tool", inputItems: [{key: "item:1", tag: "Food"}, {key: "item:6", tag: "Ore"}]}],
]);

const CRAFT_IDS = Array.from({length: 24}, (_, i) => BigInt(i + 1));
const CLAIM_IDS = [0n, 100n, 101n, 102n];
const PLAYER_IDS = [0n, 200n, 201n, 202n, 203n];
const REGION_IDS = [1, 2, 3];
const ACCOUNTS = ["acctA", "acctB"];

/** A keyed table that fires the cache's feed on every operation, like the SDK's row callbacks. */
function fakeTable<T>(key: (row: T) => string, feed: TableFeed<T>) {
    const rows = new Map<string, T>();
    return {
        rows,
        iter: () => rows.values(),
        upsert(row: T) {
            const before = rows.get(key(row));
            rows.set(key(row), row);
            if (before) feed.update(before, row);
            else feed.insert(row);
        },
        remove(k: string) {
            const before = rows.get(k);
            if (!before) return;
            rows.delete(k);
            feed.delete(before);
        },
    };
}

function harness(seed: number) {
    const rand = rng(seed);
    const int = (n: number) => Math.floor(rand() * n);
    const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
    const chance = (p: number) => rand() < p;

    const cache = createRowCache(RECIPES);
    const tables = {
        craftMeta: fakeTable<CraftMeta>(r => String(r.entityId), cache.craftMeta),
        craftProgress: fakeTable<CraftProgress>(r => String(r.entityId), cache.craftProgress),
        craftContribution: fakeTable<{craftId: bigint; playerId: bigint; contribution: number}>(r => `${r.craftId}:${r.playerId}`, cache.craftContribution),
        claimInfo: fakeTable<ClaimInfo>(r => String(r.entityId), cache.claimInfo),
        claimMember: fakeTable<ClaimMember>(r => `${r.claimEntityId}:${r.playerEntityId}`, cache.claimMember),
        playerState: fakeTable<PlayerState>(r => String(r.entityId), cache.playerState),
        region: fakeTable<Region>(r => String(r.id), cache.region),
    };
    const conn = {db: tables} as unknown as DbConnection;

    const operations: (() => void)[] = [
        () => {
            const entityId = pick(CRAFT_IDS);
            const existing = tables.craftMeta.rows.get(String(entityId));
            tables.craftMeta.upsert({
                entityId,
                ownerEntityId: pick(PLAYER_IDS),
                claimEntityId: pick(CLAIM_IDS),
                buildingEntityId: 0n,
                firstSeen: existing?.firstSeen ?? new Timestamp(BigInt(int(1000)) * 1000n),
                recipeId: pick([1, 2, 3, 99]),
                count: 1 + int(3),
                regionId: pick(REGION_IDS),
                public: chance(0.7),
                status: {tag: chance(0.8) ? "Active" : pick(["Claimed", "Removed"])},
            } as CraftMeta);
        },
        () => tables.craftMeta.remove(String(pick(CRAFT_IDS))),
        () => tables.craftProgress.upsert({entityId: pick(CRAFT_IDS), progress: int(1000)} as CraftProgress),
        () => tables.craftProgress.remove(String(pick(CRAFT_IDS))),
        () => tables.craftContribution.upsert({craftId: pick(CRAFT_IDS), playerId: pick(PLAYER_IDS), contribution: int(500)}),
        () => tables.craftContribution.remove(`${pick(CRAFT_IDS)}:${pick(PLAYER_IDS)}`),
        () => tables.claimInfo.upsert({entityId: pick(CLAIM_IDS), name: pick(["Alpha", "Beta", ""])} as ClaimInfo),
        () => tables.claimInfo.remove(String(pick(CLAIM_IDS))),
        () => tables.claimMember.upsert({
            claimEntityId: pick(CLAIM_IDS), playerEntityId: pick(PLAYER_IDS),
            build: chance(0.5), inventory: chance(0.5), officer: chance(0.3), coOwner: chance(0.2), owner: chance(0.4),
        } as ClaimMember),
        () => tables.claimMember.remove(`${pick(CLAIM_IDS)}:${pick(PLAYER_IDS)}`),
        () => tables.playerState.upsert({entityId: pick(PLAYER_IDS), name: pick(["ann", "bob", "cyd"]), online: chance(0.5)} as unknown as PlayerState),
        () => tables.playerState.remove(String(pick(PLAYER_IDS))),
        () => tables.region.upsert({id: pick(REGION_IDS), name: pick(["North", "South", ""])} as Region),
        () => tables.region.remove(String(pick(REGION_IDS))),
    ];
    const randomAssignments = (): ReadonlyMap<bigint, AssignedBounty> => {
        const next = new Map<bigint, AssignedBounty>();
        for (const id of CRAFT_IDS) {
            if (!chance(0.25)) continue;
            const account = pick(ACCOUNTS);
            next.set(id, {
                ratioNumerator: BigInt(1 + int(3)), ratioDenominator: 4n, currency: "hex-coin", private: chance(0.5),
                assignedByAccountIdentity: {toHexString: () => account},
            });
        }
        return next;
    };
    return {rand, int, pick, chance, cache, conn, tables, operations, randomAssignments};
}

const WATCHES: {id: string; filter: FilterNode; owner: string | null}[] = [
    {id: "all", filter: matchAll(), owner: null},
    {id: "open", filter: openWorkFilter(), owner: "acctA"},
    {id: "access", filter: {field: "ownerAccess", cmp: "all", value: ["member", "build"]}, owner: null},
    {id: "payout-a", filter: {field: "payout", cmp: "gte", value: 0.5}, owner: "acctA"},
    {id: "payout-b", filter: {op: "or", children: [{field: "currency", cmp: "eq", value: "hex-coin"}, {field: "complete", cmp: "eq", value: true}]}, owner: "acctB"},
    {id: "payout-none", filter: {op: "not", child: {field: "payout", cmp: "gte", value: 0.5}}, owner: null},
    {id: "input", filter: {field: "inputItem", cmp: "eq", value: "item:1", quantifier: "any"}, owner: null},
    {id: "complete", filter: {field: "complete", cmp: "eq", value: true}, owner: null},
    {id: "tier", filter: {field: "tier", cmp: "gte", value: 3}, owner: "acctB"},
];

function summarize(events: MatchEvent<CraftRow>[]): string[] {
    return events.map(event => `${event.kind}:${event.craftId}`).sort();
}

for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`incremental rows and watch events equal the full rebuild (seed ${seed})`, () => {
        const {int, chance, cache, conn, operations, randomAssignments, pick} = harness(seed);

        // Seed some state, then adopt it the way a (re)connect does.
        for (let i = 0; i < 60; i++) pick(operations)();
        let assignments = randomAssignments();
        cache.load(readSnapshot(conn));
        cache.setAssignments(assignments);
        const initial = cache.drain();
        assert.ok(initial.changed.length >= 0);

        const oracle = new Map(WATCHES.map(watch => [watch.id, createWatchMatcher<CraftRow>()]));
        const candidate = new Map(WATCHES.map(watch => [watch.id, createWatchMatcher<CraftRow>()]));
        const oracleRows = () => applyBounties(craftRowsFrom(readSnapshot(conn), RECIPES), assignments);
        for (const watch of WATCHES) {
            const view = (row: CraftRow) => rowFor(row, watch.owner);
            oracle.get(watch.id)!.update(compiledFilter(watch.filter), oracleRows(), view);
            candidate.get(watch.id)!.update(compiledFilter(watch.filter), [...cache.rows.values()], view);
        }

        for (let batch = 0; batch < 150; batch++) {
            for (let i = 1 + int(5); i > 0; i--) pick(operations)();
            if (chance(0.3)) {
                assignments = randomAssignments();
                cache.setAssignments(assignments);
            }

            const snapshot = readSnapshot(conn);
            const expected = applyBounties(craftRowsFrom(snapshot, RECIPES), assignments);
            const delta = cache.drain();

            assert.deepEqual(new Map(expected.map(row => [row.id, row])), new Map(cache.rows), `rows after batch ${batch}`);
            assert.deepEqual(snapshot.claimOwners, cache.snapshot.claimOwners, `claimOwners after batch ${batch}`);
            assert.deepEqual(snapshot.contributions, cache.snapshot.contributions, `contributions after batch ${batch}`);
            assert.deepEqual(snapshot.allCraftIds, cache.snapshot.allCraftIds);
            assert.equal(findDrift(cache, snapshot, RECIPES), null, `drift after batch ${batch}`);

            for (const watch of WATCHES) {
                const view = (row: CraftRow) => rowFor(row, watch.owner);
                const filter = compiledFilter(watch.filter);
                const want = oracle.get(watch.id)!.update(filter, expected, view);
                const got = candidate.get(watch.id)!.applyDelta(filter, delta.changed, delta.removedIds, view);
                assert.deepEqual(summarize(got), summarize(want), `${watch.id} events after batch ${batch}`);
                assert.equal(candidate.get(watch.id)!.matchCount, oracle.get(watch.id)!.matchCount, `${watch.id} match count after batch ${batch}`);
                const wantAdded = new Map(want.filter(e => e.kind !== "removed").map(e => [`${e.kind}:${e.craftId}`, e.craft]));
                for (const event of got) {
                    if (event.kind !== "removed") assert.deepEqual(event.craft, wantAdded.get(`${event.kind}:${event.craftId}`));
                }
            }
        }
    });
}

test("findDrift reports a table change the cache never heard about", () => {
    const {cache, conn, tables} = harness(11);
    tables.craftMeta.rows.set("1", {
        entityId: 1n, ownerEntityId: 0n, claimEntityId: 0n, buildingEntityId: 0n, firstSeen: new Timestamp(0n),
        recipeId: 1, count: 1, regionId: 1, public: true, status: {tag: "Active"},
    } as CraftMeta);
    cache.load(readSnapshot(conn));
    cache.drain();
    assert.equal(findDrift(cache, readSnapshot(conn), RECIPES), null);

    tables.craftProgress.rows.set("1", {entityId: 1n, progress: 7} as CraftProgress);
    const drift = findDrift(cache, readSnapshot(conn), RECIPES);
    assert.deepEqual(drift, {first: "craft 1", crafts: 1});

    tables.craftMeta.rows.delete("1");
    assert.match(findDrift(cache, readSnapshot(conn), RECIPES)?.first ?? "", /craft ids.*craft 1 \(not open\)/);
});
