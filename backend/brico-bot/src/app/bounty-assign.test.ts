/**
 * bounty-assign.test.ts — `BountyEngine.assign` with a change scope against the same engine resolving every row each tick.
 */
import type {BountyRule, CraftBountyOverride} from "@brico/bindings/brico-app/types";
import type {FilterNode} from "@brico/crafts/filter";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Identity} from "spacetimedb";

import {createLogger} from "../log.ts";
import type {CraftSnapshot} from "../relay/prism.ts";
import type {CraftRow} from "../relay/subject.ts";
import {type AssignScope, createBountyEngine} from "./bounty-sink.ts";
import type {BricoAppConnection} from "./connection.ts";

function rng(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

const identity = (n: number) => new Identity(n.toString(16).padStart(64, "0"));
const ACCOUNTS = [identity(1), identity(2), identity(3)];
const PLAYERS = [200n, 201n, 202n, 203n];
const CLAIMS = [0n, 100n, 101n];
const CRAFT_IDS = Array.from({length: 30}, (_, i) => BigInt(i + 1));

/** The slice of `brico-app` the engine reads, mutated directly by the test, plus the assignment store the engine's reducer calls write. */
function fakeApp() {
    const state = {
        links: new Map<bigint, {provider: string; revokedAt: undefined; externalId: string; accountIdentity: Identity}>(),
        rules: new Map<string, BountyRule>(),
        overrides: new Map<bigint, CraftBountyOverride>(),
        assignments: new Map<bigint, {craftId: bigint; ratioNumerator: bigint; ratioDenominator: bigint; currency: string; assignedByAccountIdentity: Identity; private: boolean}>(),
    };
    const writes: string[] = [];
    const conn = {
        isActive: true,
        db: {
            allLinkedIntegration: {iter: () => state.links.values()},
            allBountyRule: {iter: () => state.rules.values()},
            allCraftBountyOverride: {iter: () => state.overrides.values()},
            allCraftBountyAssignment: {iter: () => [...state.assignments.values()].filter(a => !a.private)},
            allPrivateCraftBountyAssignment: {iter: () => [...state.assignments.values()].filter(a => a.private)},
        },
        reducers: {
            assignCraftBounty: async (args: {craftId: bigint; ratioNumerator: bigint; ratioDenominator: bigint; currency: string; assignedByAccountIdentity: Identity; private: boolean}) => {
                writes.push(`assign ${args.craftId} ${args.ratioNumerator}/${args.ratioDenominator} ${args.currency} ${args.assignedByAccountIdentity.toHexString()} ${args.private}`);
                state.assignments.set(args.craftId, args);
            },
            clearCraftBounty: async (args: {craftId: bigint}) => {
                writes.push(`clear ${args.craftId}`);
                state.assignments.delete(args.craftId);
            },
        },
    };
    const app = {connection: {connection: conn}, isLive: true} as unknown as BricoAppConnection;
    return {app, state, writes};
}

function craftRow(id: bigint, rand: () => number): CraftRow {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
    return {
        id: id.toString(), entityId: id, claimEntityId: pick(CLAIMS), ownerEntityId: pick([0n, ...PLAYERS]),
        regionId: 1, regionName: "r", recipeId: 1, count: 1, claimName: null, ownerName: null, firstSeenMs: 0n,
        subject: {
            region: pick([1, 2]), claim: null, item: null, itemTag: null, inputItems: [], skill: pick([3, 4]), tier: pick([1, 2, 3, 4]),
            buildingType: null, effortTotal: 10, effortRemaining: 5, public: true, complete: false, owner: null, ownerClaimAccess: null,
            payout: null, currency: null, bountyPrivate: false,
        },
        privateBountyOwner: null,
        publicView: null,
    };
}

const FILTERS: FilterNode[] = [
    {field: "tier", cmp: "gte", value: 3},
    {field: "region", cmp: "eq", value: 1},
    {field: "skill", cmp: "eq", value: 4},
    {op: "not", child: {field: "tier", cmp: "eq", value: 2}},
];

for (const seed of [1, 2, 3, 4, 5]) {
    test(`a scoped assign equals resolving every row each tick (seed ${seed})`, () => {
        const rand = rng(seed);
        const int = (n: number) => Math.floor(rand() * n);
        const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
        const chance = (p: number) => rand() < p;

        const full = fakeApp();
        const scoped = fakeApp();
        const log = createLogger("error");
        const fullEngine = createBountyEngine(full.app, log);
        const scopedEngine = createBountyEngine(scoped.app, log);

        const rows = new Map<bigint, CraftRow>();
        const claimOwners = new Map<bigint, bigint[]>();
        let ruleSeq = 0;
        const both = (fn: (state: ReturnType<typeof fakeApp>["state"]) => void) => {
            fn(full.state);
            fn(scoped.state);
        };
        for (const id of CRAFT_IDS) if (chance(0.7)) rows.set(id, craftRow(id, rand));

        for (let tick = 0; tick < 120; tick++) {
            const touched = new Set<bigint>();
            for (let i = 1 + int(4); i > 0; i--) {
                const roll = int(10);
                if (roll < 3) {
                    const id = pick(CRAFT_IDS);
                    rows.set(id, craftRow(id, rand));
                    touched.add(id);
                } else if (roll === 3) {
                    rows.delete(pick(CRAFT_IDS));
                } else if (roll === 4) {
                    const claim = pick(CLAIMS.slice(1));
                    claimOwners.set(claim, PLAYERS.filter(() => chance(0.4)));
                    for (const row of rows.values()) if (row.claimEntityId === claim) touched.add(row.entityId);
                } else if (roll === 5) {
                    const player = pick(PLAYERS);
                    if (chance(0.5)) both(state => state.links.delete(player));
                    else {
                        const account = pick(ACCOUNTS);
                        both(state => state.links.set(player, {provider: "bitcraft-ea2", revokedAt: undefined, externalId: player.toString(), accountIdentity: account}));
                    }
                } else if (roll === 6) {
                    const id = `rule${ruleSeq++ % 4}`;
                    if (chance(0.3)) both(state => state.rules.delete(id));
                    else {
                        const account = pick(ACCOUNTS);
                        const filter = pick(FILTERS);
                        const numerator = BigInt(1 + int(3));
                        const isPrivate = chance(0.3);
                        const priority = int(3);
                        both(state => state.rules.set(id, {
                            id, accountIdentity: account, priority, filterJson: JSON.stringify(filter), private: isPrivate,
                            value: {tag: "Flat", value: {ratioNumerator: numerator, ratioDenominator: 4n, currency: "hex-coin"}},
                        } as unknown as BountyRule));
                    }
                } else if (roll === 7) {
                    const craftId = pick(CRAFT_IDS);
                    if (chance(0.4)) both(state => state.overrides.delete(craftId));
                    else {
                        const account = pick(ACCOUNTS);
                        both(state => state.overrides.set(craftId, {craftId, accountIdentity: account, ratioNumerator: 1n, ratioDenominator: 2n, currency: "hex-coin", private: false} as unknown as CraftBountyOverride));
                    }
                }
                // Anything else is a tick with nothing relevant changed.
            }

            const snapshot = {claimOwners, contributions: new Map(), allCraftIds: new Set([...rows.keys(), ...CRAFT_IDS.filter(id => id % 7n === 0n)])} as unknown as CraftSnapshot;
            const scope: AssignScope = {full: tick === 0, changed: [...touched].flatMap(id => rows.get(id) ?? []), rowOf: id => rows.get(id)};

            const expected = fullEngine.assign(snapshot, rows.values());
            const actual = scopedEngine.assign(snapshot, rows.values(), scope);

            const summarize = (map: ReadonlyMap<bigint, {ratioNumerator: bigint; ratioDenominator: bigint; currency: string; private: boolean; assignedByAccountIdentity: {toHexString(): string}}>) =>
                [...map].map(([id, b]) => `${id} ${b.ratioNumerator}/${b.ratioDenominator} ${b.currency} ${b.private} ${b.assignedByAccountIdentity.toHexString()}`).sort();
            assert.deepEqual(summarize(actual), summarize(expected), `bounties at tick ${tick}`);
            assert.deepEqual([...scoped.writes].sort(), [...full.writes].sort(), `writes at tick ${tick}`);
            full.writes.length = 0;
            scoped.writes.length = 0;
        }
    });
}
