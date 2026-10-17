/**
 * bounty-engine.test.ts — the delta-driven `BountyEngine` against the same engine told to
 * re-evaluate everything each tick, over random prism and `brico-app` row operations, with a fake
 * `brico-app` module that applies (and echoes back) the engine's reducer calls. Both must issue the
 * same writes every tick and leave the same module state.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {CraftMeta} from "@brico/bindings/prism/types";
import {matchAll} from "@brico/crafts/filter";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Identity, Timestamp} from "spacetimedb";

import type {RecipeIndex, RecipeStatic} from "../game-data/recipes.ts";
import type {Logger} from "../log.ts";
import {readSnapshot} from "../relay/prism.ts";
import {createRowCache} from "../relay/row-cache.ts";
import {fakeTable} from "../testing/fake-table.ts";
import {createAppCache} from "./app-cache.ts";
import {bountyScope, createBountyEngine} from "./bounty-sink.ts";
import type {BricoAppConnection} from "./connection.ts";

const quiet: Logger = {debug() {}, info() {}, warn() {}, error() {}, child: () => quiet};

function rng(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

const RECIPES: RecipeIndex = new Map<number, RecipeStatic>([
    [1, {effortRequired: 100, skillId: 3, buildingType: 10, levelRequired: 25, itemKey: "item:1", itemTag: "Food", inputItems: []}],
    [2, {effortRequired: 40, skillId: 4, buildingType: 11, levelRequired: 5, itemKey: "cargo:2", itemTag: null, inputItems: []}],
]);

const identity = (n: number) => new Identity(n.toString(16).padStart(64, "0"));
const ACCOUNTS = [identity(1), identity(2), identity(3)];
const PLAYERS = [200n, 201n, 202n, 203n];
const CLAIMS = [0n, 100n, 101n];
const CRAFT_IDS = Array.from({length: 24}, (_, i) => BigInt(i + 1));
const CURRENCIES = ["hex-coin", "stelo"];
const FILTERS = [
    {field: "skill", cmp: "eq", value: 3},
    {field: "region", cmp: "eq", value: 1},
    {field: "skill", cmp: "eq", value: 4},
    {op: "not", child: {field: "region", cmp: "eq", value: 2}},
];

const raw = <T>(value: object) => value as unknown as T;
const hex = (account: Identity) => account.toHexString();

/** A fake `brico-app` module: the tables the cache mirrors, plus the reducers the engine calls, applied on `flush()` like a round trip. */
function fakeModule(feeds: ReturnType<typeof createAppCache>, seed: number) {
    const tables = {
        allLinkedIntegration: fakeTable<any>(r => String(r.id), feeds.linkedIntegration),
        allBountyRule: fakeTable<any>(r => r.id, feeds.bountyRule),
        allCraftBountyOverride: fakeTable<any>(r => String(r.craftId), feeds.craftBountyOverride),
        allCraftBountyAssignment: fakeTable<any>(r => String(r.craftId), feeds.craftBountyAssignment),
        allPrivateCraftBountyAssignment: fakeTable<any>(r => String(r.craftId), feeds.privateCraftBountyAssignment),
        allCraftBountyEntitlement: fakeTable<any>(r => String(r.id), feeds.craftBountyEntitlement),
        allLoyaltyReward: fakeTable<any>(r => String(r.id), feeds.loyaltyReward),
        allLoyaltyRule: fakeTable<any>(r => String(r.id), feeds.loyaltyRule),
        allLoyaltyBonusTotal: fakeTable<any>(r => String(r.id), feeds.loyaltyBonusTotal),
        allBountyEntitlementTotal: fakeTable<any>(r => String(r.id), feeds.bountyEntitlementTotal),
    };
    const writes: string[] = [];
    const queue: (() => void)[] = [];
    let round = 0;
    // Whether a call fails depends only on what it is and which tick it is in, not on the order the engine issued it.
    const fails = (description: string) => {
        let hash = 2166136261 ^ seed;
        for (const char of `${round}:${description}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
        return hash % 100 < 8;
    };

    const call = (description: string, apply: () => void): Promise<void> => {
        writes.push(description);
        return new Promise((resolve, reject) => {
            queue.push(() => {
                if (fails(description)) return reject(new Error("injected failure"));
                try {
                    apply();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    };
    const find = (table: {rows: Map<string, any>}, match: (row: any) => boolean) => [...table.rows.values()].find(match);
    const assignmentOf = (craftId: bigint) =>
        tables.allCraftBountyAssignment.rows.get(String(craftId)) ?? tables.allPrivateCraftBountyAssignment.rows.get(String(craftId));
    const setEntitlement = (craftId: bigint, playerId: bigint, currency: string, effort: bigint) => {
        const row = {id: `${craftId}:${playerId}:${currency}`, craftId, playerId, currency, lastAssignedEffort: effort, updatedAt: Timestamp.now()};
        tables.allCraftBountyEntitlement.upsert(row);
    };

    const reducers = {
        assignCraftBounty: (args: any) => call(
            `assign ${args.craftId} ${args.ratioNumerator}/${args.ratioDenominator} ${args.currency} ${hex(args.assignedByAccountIdentity)} ${args.private} [${args.baselines.map((b: any) => `${b.playerId}:${b.effort}`)}]`,
            () => {
                const [into, other] = args.private
                    ? [tables.allPrivateCraftBountyAssignment, tables.allCraftBountyAssignment]
                    : [tables.allCraftBountyAssignment, tables.allPrivateCraftBountyAssignment];
                into.upsert({craftId: args.craftId, ratioNumerator: args.ratioNumerator, ratioDenominator: args.ratioDenominator, currency: args.currency, assignedByAccountIdentity: args.assignedByAccountIdentity, assignedAt: args.assignedAt, updatedAt: args.updatedAt});
                other.remove(String(args.craftId));
                for (const baseline of args.baselines) {
                    if (!find(tables.allCraftBountyEntitlement, r => r.craftId === args.craftId && r.playerId === baseline.playerId && r.currency === args.currency)) {
                        setEntitlement(args.craftId, baseline.playerId, args.currency, baseline.effort);
                    }
                }
            },
        ),
        clearCraftBounty: (args: any) => call(`clear ${args.craftId}`, () => {
            tables.allCraftBountyAssignment.remove(String(args.craftId));
            tables.allPrivateCraftBountyAssignment.remove(String(args.craftId));
        }),
        upsertCraftBountyEntitlement: (args: any) => call(
            `entitle ${args.craftId}:${args.playerId}:${args.currency} effort=${args.effort} ratio=${args.ratioNumerator}/${args.ratioDenominator}`,
            () => {
                const assignment = assignmentOf(args.craftId);
                if (!assignment) throw new Error("no bounty assignment");
                const existing = find(tables.allCraftBountyEntitlement, r => r.craftId === args.craftId && r.playerId === args.playerId && r.currency === args.currency);
                const delta = BigInt(args.effort) - BigInt(existing?.lastAssignedEffort ?? 0n);
                setEntitlement(args.craftId, args.playerId, args.currency, args.effort);
                if (delta === 0n) return;
                const payer = assignment.assignedByAccountIdentity as Identity;
                const total = find(tables.allBountyEntitlementTotal, r => r.payerAccountIdentity.isEqual(payer) && r.payeePlayerId === args.playerId && r.currency === args.currency);
                tables.allBountyEntitlementTotal.upsert({
                    id: `${hex(payer)}:${args.playerId}:${args.currency}`, payerAccountIdentity: payer, payeePlayerId: args.playerId, currency: args.currency,
                    total: (total?.total ?? 0n) + (delta * args.ratioNumerator) / args.ratioDenominator, totalEffort: (total?.totalEffort ?? 0n) + delta,
                    remainderNumerator: 0n, remainderDenominator: 1n, updatedAt: Timestamp.now(),
                });
            },
        ),
        upsertLoyaltyBonusTotal: (args: any) => call(
            `bonus ${hex(args.payerAccountIdentity)}:${args.payeePlayerId}:${args.currency} ${args.bonusRatioNumerator}/${args.bonusRatioDenominator}`,
            () => {
                tables.allLoyaltyBonusTotal.upsert({...args, id: `${hex(args.payerAccountIdentity)}:${args.payeePlayerId}:${args.currency}`});
            },
        ),
        deleteLoyaltyBonusTotal: (args: any) => call(
            `bonus-delete ${hex(args.payerAccountIdentity)}:${args.payeePlayerId}:${args.currency}`,
            () => {
                tables.allLoyaltyBonusTotal.remove(`${hex(args.payerAccountIdentity)}:${args.payeePlayerId}:${args.currency}`);
            },
        ),
    };

    const conn = {isActive: true, db: tables, reducers} as unknown as DbConnection;
    return {
        tables,
        conn,
        writes,
        /** Applies every queued reducer call in order, firing the cache's feeds like the echo of a round trip. */
        flush() {
            for (const apply of queue.splice(0)) apply();
            round += 1;
        },
    };
}

function createSide(options: {forceFull: boolean; seed: number}) {
    const rowCache = createRowCache(RECIPES);
    const prism = {
        craftMeta: fakeTable<CraftMeta>(r => String(r.entityId), rowCache.craftMeta),
        craftProgress: fakeTable<any>(r => String(r.entityId), rowCache.craftProgress),
        craftContribution: fakeTable<any>(r => `${r.craftId}:${r.playerId}`, rowCache.craftContribution),
        claimInfo: fakeTable<any>(r => String(r.entityId), rowCache.claimInfo),
        claimMember: fakeTable<any>(r => `${r.claimEntityId}:${r.playerEntityId}`, rowCache.claimMember),
        playerState: fakeTable<any>(r => String(r.entityId), rowCache.playerState),
        region: fakeTable<any>(r => String(r.id), rowCache.region),
    };
    const appCache = createAppCache(quiet);
    const module = fakeModule(appCache, options.seed);
    const app = {connection: {connection: module.conn}, isLive: true} as unknown as BricoAppConnection;
    const engine = createBountyEngine(app, appCache, quiet);
    let started = false;

    return {
        rowCache, prism, appCache, module, engine,
        /** One bridge tick's bounty steps, then the round trip of whatever they wrote. */
        async tick() {
            if (!started) {
                started = true;
                rowCache.load(readSnapshot(raw<any>({db: prism})));
                appCache.load(module.conn);
            }
            const delta = rowCache.drain();
            const appDelta = appCache.drain();
            const scope = bountyScope(delta, appDelta, rowCache.baseRows);
            const effective = options.forceFull ? {...scope, full: true} : scope;
            const assigned = engine.assign(rowCache.snapshot, rowCache.baseRows.values(), effective);
            engine.updateEntitlements(rowCache.snapshot, effective);
            engine.updateLoyaltyBonuses(rowCache.snapshot, effective);
            // The full side diffs the whole map, the other trusts the engine's `changed`.
            if (options.forceFull) rowCache.setAssignments(assigned.bounties);
            else rowCache.setAssignments(assigned.bounties, assigned.changed);
            rowCache.drain();
            const written = module.writes.splice(0);
            module.flush();
            // Lets the engine's `.catch` handlers for rejected calls run before the next tick.
            await new Promise(resolve => setImmediate(resolve));
            return written;
        },
        /** The module's rows as comparable lines, ignoring timestamps. */
        state() {
            const lines: string[] = [];
            for (const [name, table] of Object.entries(module.tables)) {
                for (const row of table.rows.values()) {
                    lines.push(`${name} ${JSON.stringify(row, (key, value) => key === "updatedAt" || key === "assignedAt" ? undefined : typeof value === "bigint" ? value.toString() : value)}`);
                }
            }
            return lines.sort();
        },
    };
}

type Side = ReturnType<typeof createSide>;

const craftMeta = (id: bigint, owner: bigint, claim: bigint, recipe: number, region: number, status: "Active" | "Claimed", firstSeenMicros: bigint) => raw<CraftMeta>({
    entityId: id, ownerEntityId: owner, claimEntityId: claim, buildingEntityId: 0n, firstSeen: new Timestamp(firstSeenMicros),
    recipeId: recipe, count: 1, regionId: region, public: true, status: {tag: status},
});

/** A random row operation as data, so both sides can apply the same one. */
function generator(seed: number) {
    const rand = rng(seed);
    const int = (n: number) => Math.floor(rand() * n);
    const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
    const chance = (p: number) => rand() < p;
    const effort = new Map<string, bigint>();
    let linkId = 1n;
    let loyaltyId = 1n;

    const operations: (() => (side: Side) => void)[] = [
        () => {
            const id = pick(CRAFT_IDS), owner = pick([0n, ...PLAYERS]), claim = pick(CLAIMS), recipe = pick([1, 2]), region = pick([1, 2]);
            const status = chance(0.85) ? "Active" : "Claimed";
            const firstSeen = chance(0.5) ? 0n : BigInt(Date.now()) * 1000n;
            return side => {
                const existing = side.prism.craftMeta.rows.get(String(id));
                side.prism.craftMeta.upsert(craftMeta(id, owner, claim, recipe, region, status, existing ? existing.firstSeen.microsSinceUnixEpoch : firstSeen));
            };
        },
        () => {
            const id = pick(CRAFT_IDS);
            return side => side.prism.craftMeta.remove(String(id));
        },
        ...Array.from({length: 4}, () => () => {
            const craftId = pick(CRAFT_IDS), playerId = pick(PLAYERS);
            const next = (effort.get(`${craftId}:${playerId}`) ?? 0n) + BigInt(1 + int(60));
            effort.set(`${craftId}:${playerId}`, next);
            return (side: Side) => side.prism.craftContribution.upsert({craftId, playerId, contribution: Number(next)});
        }),
        () => {
            const craftId = pick(CRAFT_IDS), playerId = pick(PLAYERS);
            effort.delete(`${craftId}:${playerId}`);
            return side => side.prism.craftContribution.remove(`${craftId}:${playerId}`);
        },
        () => {
            const row = {
                entityId: 0n, regionId: 0, claimEntityId: pick(CLAIMS.slice(1)), playerEntityId: pick(PLAYERS),
                build: chance(0.5), inventory: chance(0.3), officer: chance(0.3), coOwner: chance(0.2), owner: chance(0.4),
            };
            return side => side.prism.claimMember.upsert(row);
        },
        () => {
            const key = `${pick(CLAIMS.slice(1))}:${pick(PLAYERS)}`;
            return side => side.prism.claimMember.remove(key);
        },
        () => {
            const id = linkId++ % 5n, player = pick(PLAYERS), account = pick(ACCOUNTS), revoked = chance(0.2);
            return side => side.module.tables.allLinkedIntegration.upsert({
                id, accountIdentity: account, provider: "bitcraft-ea2", externalId: player.toString(), revokedAt: revoked ? Timestamp.now() : undefined,
            });
        },
        () => {
            const id = String(pick([0n, 1n, 2n, 3n, 4n]));
            return side => side.module.tables.allLinkedIntegration.remove(id);
        },
        () => {
            const id = `rule${int(4)}`, account = pick(ACCOUNTS), filter = pick(FILTERS), priority = int(3), isPrivate = chance(0.3);
            const numerator = BigInt(1 + int(3)), currency = pick(CURRENCIES);
            return side => side.module.tables.allBountyRule.upsert({
                id, accountIdentity: account, priority, filterJson: JSON.stringify(filter), private: isPrivate,
                value: {tag: "Flat", value: {ratioNumerator: numerator, ratioDenominator: 4n, currency}}, deletedAt: undefined,
            });
        },
        () => {
            const id = `rule${int(4)}`;
            return side => side.module.tables.allBountyRule.remove(id);
        },
        () => {
            const craftId = pick(CRAFT_IDS), account = pick(ACCOUNTS), isPrivate = chance(0.3), currency = pick(CURRENCIES);
            return side => side.module.tables.allCraftBountyOverride.upsert({craftId, accountIdentity: account, ratioNumerator: 1n, ratioDenominator: 2n, currency, private: isPrivate});
        },
        () => {
            const craftId = pick(CRAFT_IDS);
            return side => side.module.tables.allCraftBountyOverride.remove(String(craftId));
        },
        ...Array.from({length: 2}, () => () => {
            const id = BigInt(1 + int(5)), payer = pick(ACCOUNTS), currency = pick(CURRENCIES);
            const spec = chance(0.4)
                ? {tag: "ClaimMembership", value: {claimEntityId: pick(CLAIMS.slice(1)), requiredAccess: pick(["member", "build", "officer", "owner"])}}
                : {tag: "EffortThreshold", value: {allCurrencies: chance(0.5), threshold: BigInt(20 + int(300))}};
            const numerator = BigInt(1 + int(3)), denominator = BigInt(pick([20, 40, 50]));
            return (side: Side) => side.module.tables.allLoyaltyRule.upsert({
                id, payerAccountIdentity: payer, currency, spec, bonusRatioNumerator: numerator, bonusRatioDenominator: denominator, updatedAt: Timestamp.now(),
            });
        }),
        () => {
            const id = String(1 + int(5));
            return side => side.module.tables.allLoyaltyRule.remove(id);
        },
        () => {
            const id = loyaltyId++ % 4n, payer = pick(ACCOUNTS), player = pick(PLAYERS), currency = pick(CURRENCIES);
            return side => side.module.tables.allLoyaltyReward.upsert({id, payerAccountIdentity: payer, payeePlayerId: player, currency, ratioNumerator: 21n, ratioDenominator: 20n, updatedAt: Timestamp.now()});
        },
        () => {
            const id = String(pick([0n, 1n, 2n, 3n]));
            return side => side.module.tables.allLoyaltyReward.remove(id);
        },
        // Someone else deleting a stored assignment: the engine must write it back.
        () => {
            const craftId = pick(CRAFT_IDS);
            return side => {
                side.module.tables.allCraftBountyAssignment.remove(String(craftId));
                side.module.tables.allPrivateCraftBountyAssignment.remove(String(craftId));
            };
        },
    ];
    return {chance, int, batch: () => Array.from({length: 1 + int(5)}, () => pick(operations)())};
}

const kinds = new Map<string, number>();

for (const seed of [1, 2, 3, 4, 5, 6]) {
    test(`delta-driven steps issue the same writes as a full pass each tick (seed ${seed})`, async () => {
        const gen = generator(seed);
        const sides = [createSide({forceFull: true, seed}), createSide({forceFull: false, seed})] as const;
        const [oracle, candidate] = sides;

        for (let i = 0; i < 30; i++) for (const apply of gen.batch()) for (const side of sides) apply(side);

        for (let tick = 0; tick < 150; tick++) {
            for (const apply of gen.batch()) for (const side of sides) apply(side);
            const expected = await oracle.tick();
            const actual = await candidate.tick();

            assert.deepEqual([...actual].sort(), [...expected].sort(), `writes at tick ${tick}`);
            assert.deepEqual(candidate.state(), oracle.state(), `module state at tick ${tick}`);
            assert.deepEqual(candidate.rowCache.rows, oracle.rowCache.rows, `served rows at tick ${tick}`);
            for (const write of actual) kinds.set(write.split(" ")[0]!, (kinds.get(write.split(" ")[0]!) ?? 0) + 1);
        }
    });
}

test("the random runs exercise every kind of write", () => {
    for (const kind of ["assign", "clear", "entitle", "bonus", "bonus-delete"]) assert.ok((kinds.get(kind) ?? 0) > 0, `no ${kind} write was ever issued`);
});

/** A hex-coin rule matching every craft, owned by account 1 who is linked to player 200, who owns craft 1. */
function bountiedCraft(side: Side) {
    side.module.tables.allLinkedIntegration.upsert({id: 1n, accountIdentity: ACCOUNTS[0], provider: "bitcraft-ea2", externalId: "200", revokedAt: undefined});
    side.module.tables.allBountyRule.upsert({
        id: "rule", accountIdentity: ACCOUNTS[0], priority: 0, filterJson: JSON.stringify(matchAll()), private: false,
        value: {tag: "Flat", value: {ratioNumerator: 1n, ratioDenominator: 4n, currency: "hex-coin"}}, deletedAt: undefined,
    });
    side.prism.craftMeta.upsert(craftMeta(1n, 200n, 0n, 1, 1, "Active", FRESH));
}

/** A craft prism first saw just now, so effort already on it when its bounty is assigned still counts. */
const FRESH = BigInt(Date.now()) * 1000n;

const bonuses = (writes: string[]) => writes.filter(write => write.startsWith("bonus"));

test("an effort threshold crossed by a craft's contribution is applied on the next tick, though no craft changed", async () => {
    const side = createSide({forceFull: false, seed: 1});
    bountiedCraft(side);
    side.module.tables.allLoyaltyRule.upsert({
        id: 1n, payerAccountIdentity: ACCOUNTS[0], currency: "hex-coin", spec: {tag: "EffortThreshold", value: {allCurrencies: false, threshold: 100n}},
        bonusRatioNumerator: 1n, bonusRatioDenominator: 50n, updatedAt: Timestamp.now(),
    });
    side.prism.craftContribution.upsert({craftId: 1n, playerId: 201n, contribution: 150});

    const first = await side.tick();
    assert.ok(first.some(write => write.startsWith("entitle 1:201:hex-coin")), "the contribution is priced");
    assert.deepEqual(bonuses(first), [], "priced before the crossing is visible");

    const second = await side.tick();
    assert.deepEqual(bonuses(second), [`bonus ${hex(ACCOUNTS[0])}:201:hex-coin 1/50`]);
});

test("an all-currencies threshold crossed in one currency updates the bonus of another currency of the same payee", async () => {
    const side = createSide({forceFull: false, seed: 1});
    bountiedCraft(side);
    side.prism.craftMeta.upsert(craftMeta(2n, 200n, 0n, 1, 1, "Active", FRESH));
    side.module.tables.allCraftBountyOverride.upsert({craftId: 2n, accountIdentity: ACCOUNTS[0], ratioNumerator: 1n, ratioDenominator: 4n, currency: "stelo", private: false});
    side.module.tables.allLoyaltyRule.upsert({
        id: 1n, payerAccountIdentity: ACCOUNTS[0], currency: "stelo", spec: {tag: "EffortThreshold", value: {allCurrencies: true, threshold: 100n}},
        bonusRatioNumerator: 1n, bonusRatioDenominator: 50n, updatedAt: Timestamp.now(),
    });
    side.prism.craftContribution.upsert({craftId: 2n, playerId: 201n, contribution: 10});
    await side.tick();
    await side.tick();
    assert.deepEqual(bonuses(await side.tick()), [], "10 effort in stelo is below the combined threshold");

    side.prism.craftContribution.upsert({craftId: 1n, playerId: 201n, contribution: 95});
    await side.tick();
    assert.deepEqual(bonuses(await side.tick()), [`bonus ${hex(ACCOUNTS[0])}:201:stelo 1/50`], "95 hex-coin + 10 stelo crosses 100 for the stelo rule");
});

test("a claim-membership change updates the bonus of a payee with earnings and no live craft", async () => {
    const side = createSide({forceFull: false, seed: 1});
    bountiedCraft(side);
    side.module.tables.allLoyaltyRule.upsert({
        id: 1n, payerAccountIdentity: ACCOUNTS[0], currency: "hex-coin", spec: {tag: "ClaimMembership", value: {claimEntityId: 100n, requiredAccess: "member"}},
        bonusRatioNumerator: 1n, bonusRatioDenominator: 40n, updatedAt: Timestamp.now(),
    });
    side.prism.craftContribution.upsert({craftId: 1n, playerId: 201n, contribution: 20});
    await side.tick();
    await side.tick();

    side.prism.craftMeta.upsert(craftMeta(1n, 200n, 0n, 1, 1, "Claimed", FRESH));
    await side.tick();
    side.prism.claimMember.upsert({entityId: 0n, regionId: 0, claimEntityId: 100n, playerEntityId: 201n, build: false, inventory: false, officer: false, coOwner: false, owner: false});
    assert.deepEqual(bonuses(await side.tick()), [`bonus ${hex(ACCOUNTS[0])}:201:hex-coin 1/40`]);

    side.prism.claimMember.remove("100:201");
    assert.deepEqual(bonuses(await side.tick()), [`bonus-delete ${hex(ACCOUNTS[0])}:201:hex-coin`]);
});

test("a closed craft keeps its stored assignment until prism deletes the craft outright", async () => {
    const side = createSide({forceFull: false, seed: 1});
    bountiedCraft(side);
    assert.ok((await side.tick()).some(write => write.startsWith("assign 1 ")));

    side.prism.craftMeta.upsert(craftMeta(1n, 200n, 0n, 1, 1, "Claimed", FRESH));
    assert.deepEqual(await side.tick(), [], "the 24-hour tail leaves the assignment alone");

    side.prism.craftMeta.remove("1");
    assert.deepEqual(await side.tick(), ["clear 1"]);
});
