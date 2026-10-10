/**
 * app-cache.test.ts — the `brico-app` mirror against a fresh full read after random row operations,
 * plus what `drain()` reports.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import assert from "node:assert/strict";
import {test} from "node:test";
import {Identity, Timestamp} from "spacetimedb";

import type {Logger} from "../log.ts";
import {fakeTable} from "../testing/fake-table.ts";
import {type AppCache, createAppCache, findAppDrift, tripleKey} from "./app-cache.ts";

function rng(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

const identity = (n: number) => new Identity(n.toString(16).padStart(64, "0"));
const ACCOUNTS = [identity(1), identity(2), identity(3)];
const warnings: string[] = [];
const spyLog: Logger = {debug() {}, info() {}, warn: message => void warnings.push(message), error() {}, child: () => spyLog};

function tables(cache: AppCache) {
    const t = {
        allLinkedIntegration: fakeTable<any>(r => String(r.id), cache.linkedIntegration),
        allBountyRule: fakeTable<any>(r => r.id, cache.bountyRule),
        allCraftBountyOverride: fakeTable<any>(r => String(r.craftId), cache.craftBountyOverride),
        allCraftBountyAssignment: fakeTable<any>(r => String(r.craftId), cache.craftBountyAssignment),
        allPrivateCraftBountyAssignment: fakeTable<any>(r => String(r.craftId), cache.privateCraftBountyAssignment),
        allCraftBountyEntitlement: fakeTable<any>(r => String(r.id), cache.craftBountyEntitlement),
        allLoyaltyReward: fakeTable<any>(r => String(r.id), cache.loyaltyReward),
        allLoyaltyRule: fakeTable<any>(r => String(r.id), cache.loyaltyRule),
        allLoyaltyBonusTotal: fakeTable<any>(r => String(r.id), cache.loyaltyBonusTotal),
        allBountyEntitlementTotal: fakeTable<any>(r => String(r.id), cache.bountyEntitlementTotal),
    };
    return {...t, conn: {db: t} as unknown as DbConnection};
}

const flatRule = (id: string, account: Identity, filterJson: string, extra: object = {}) => ({
    id, accountIdentity: account, priority: 0, filterJson, private: false,
    value: {tag: "Flat", value: {ratioNumerator: 1n, ratioDenominator: 4n, currency: "hex-coin"}}, deletedAt: undefined, ...extra,
});

for (const seed of [1, 2, 3, 4]) {
    test(`the cache equals a fresh full read after random operations (seed ${seed})`, () => {
        const rand = rng(seed);
        const int = (n: number) => Math.floor(rand() * n);
        const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
        const chance = (p: number) => rand() < p;

        const cache = createAppCache(spyLog);
        const t = tables(cache);
        // Ledger rows are unique per (payer, payee, currency) in the module, so their ids are that key here.
        const triple = () => {
            const row = {payerAccountIdentity: pick(ACCOUNTS), payeePlayerId: BigInt(200 + int(3)), currency: pick(["hex-coin", "stelo"])};
            return {...row, id: tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency)};
        };
        const tripleId = () => triple().id;

        const operations: (() => void)[] = [
            // At most one active link per player in the module, so each link id owns one player here.
            () => {
                const id = int(3);
                t.allLinkedIntegration.upsert({id: BigInt(id), accountIdentity: pick(ACCOUNTS), provider: pick(["bitcraft-ea2", "bitcraft-ea2", "discord"]), externalId: String(200 + id), revokedAt: chance(0.3) ? Timestamp.now() : undefined});
            },
            () => t.allLinkedIntegration.remove(String(int(3))),
            () => t.allBountyRule.upsert(flatRule(`rule${int(3)}`, pick(ACCOUNTS), JSON.stringify(pick([{field: "tier", cmp: "gte", value: 2}, {field: "payout", cmp: "gte", value: 1}])), {priority: int(2), deletedAt: chance(0.2) ? Timestamp.now() : undefined})),
            () => t.allBountyRule.remove(`rule${int(3)}`),
            () => t.allCraftBountyOverride.upsert({craftId: BigInt(int(4)), accountIdentity: pick(ACCOUNTS), ratioNumerator: BigInt(1 + int(2)), ratioDenominator: 2n, currency: "hex-coin", private: false}),
            () => t.allCraftBountyOverride.remove(String(int(4))),
            // A craft moving between the two assignment tables, delivering either table's change first.
            () => {
                const craftId = BigInt(int(4));
                const row = {craftId, ratioNumerator: BigInt(1 + int(2)), ratioDenominator: 4n, currency: "hex-coin", assignedByAccountIdentity: pick(ACCOUNTS)};
                const [into, other] = chance(0.5) ? [t.allCraftBountyAssignment, t.allPrivateCraftBountyAssignment] : [t.allPrivateCraftBountyAssignment, t.allCraftBountyAssignment];
                if (chance(0.5)) {
                    into.upsert(row);
                    other.remove(String(craftId));
                } else {
                    other.remove(String(craftId));
                    into.upsert(row);
                }
            },
            () => t.allCraftBountyAssignment.remove(String(int(4))),
            () => {
                const craftId = BigInt(int(4)), playerId = BigInt(200 + int(3));
                t.allCraftBountyEntitlement.upsert({id: `${craftId}:${playerId}`, craftId, playerId, currency: "hex-coin", lastAssignedEffort: BigInt(int(100)), updatedAt: Timestamp.now()});
            },
            () => t.allCraftBountyEntitlement.remove(`${int(4)}:${200 + int(3)}`),
            () => t.allLoyaltyReward.upsert({...triple(), ratioNumerator: 21n, ratioDenominator: 20n, updatedAt: Timestamp.now()}),
            () => t.allLoyaltyReward.remove(tripleId()),
            // A rule id may change payer: both payers' rule lists change.
            () => t.allLoyaltyRule.upsert({id: BigInt(int(3)), payerAccountIdentity: pick(ACCOUNTS), currency: "hex-coin", spec: {tag: "EffortThreshold", value: {allCurrencies: chance(0.5), threshold: BigInt(int(100))}}, bonusRatioNumerator: 1n, bonusRatioDenominator: 50n, updatedAt: Timestamp.now()}),
            () => t.allLoyaltyRule.remove(String(int(3))),
            () => t.allLoyaltyBonusTotal.upsert({...triple(), bonusRatioNumerator: 1n, bonusRatioDenominator: 40n, updatedAt: Timestamp.now()}),
            () => t.allLoyaltyBonusTotal.remove(tripleId()),
            () => t.allBountyEntitlementTotal.upsert({...triple(), total: 1n, totalEffort: BigInt(int(100)), remainderNumerator: 0n, remainderDenominator: 1n, updatedAt: Timestamp.now()}),
            () => t.allBountyEntitlementTotal.remove(tripleId()),
        ];

        for (let batch = 0; batch < 300; batch++) {
            for (let i = 1 + int(5); i > 0; i--) pick(operations)();
            assert.equal(findAppDrift(cache, t.conn), null, `drift after batch ${batch}`);
        }
    });
}

test("drain reports what changed and then resets", () => {
    const cache = createAppCache(spyLog);
    const t = tables(cache);
    cache.load(t.conn);
    assert.equal(cache.drain().full, true, "a load is a full pass");
    assert.deepEqual(cache.drain(), {full: false, resolveAll: false, overrideCrafts: new Set(), assignmentCrafts: new Set(), totals: new Map(), loyaltyRulePayers: new Set()});

    t.allCraftBountyOverride.upsert({craftId: 7n, accountIdentity: ACCOUNTS[0], ratioNumerator: 1n, ratioDenominator: 2n, currency: "hex-coin", private: false});
    t.allCraftBountyAssignment.upsert({craftId: 8n, ratioNumerator: 1n, ratioDenominator: 2n, currency: "hex-coin", assignedByAccountIdentity: ACCOUNTS[0]});
    t.allBountyEntitlementTotal.upsert({id: 1n, payerAccountIdentity: ACCOUNTS[1], payeePlayerId: 201n, currency: "stelo", total: 1n, totalEffort: 4n, remainderNumerator: 0n, remainderDenominator: 1n, updatedAt: Timestamp.now()});
    t.allLoyaltyRule.upsert({id: 1n, payerAccountIdentity: ACCOUNTS[2], currency: "stelo", spec: {tag: "EffortThreshold", value: {allCurrencies: false, threshold: 5n}}, bonusRatioNumerator: 1n, bonusRatioDenominator: 50n, updatedAt: Timestamp.now()});
    t.allLoyaltyReward.upsert({id: 1n, payerAccountIdentity: ACCOUNTS[2], payeePlayerId: 201n, currency: "stelo", ratioNumerator: 21n, ratioDenominator: 20n, updatedAt: Timestamp.now()});

    const delta = cache.drain();
    assert.deepEqual([...delta.overrideCrafts], [7n]);
    assert.deepEqual([...delta.assignmentCrafts], [8n]);
    assert.deepEqual([...delta.totals.keys()], [tripleKey(ACCOUNTS[1], 201n, "stelo")]);
    assert.deepEqual([...delta.loyaltyRulePayers], [ACCOUNTS[2].toHexString()]);
    assert.equal(delta.resolveAll, false, "overrides, assignments and loyalty rows never re-resolve every craft");
    assert.equal(cache.drain().overrideCrafts.size, 0);

    t.allLinkedIntegration.upsert({id: 1n, accountIdentity: ACCOUNTS[0], provider: "bitcraft-ea2", externalId: "200", revokedAt: undefined});
    assert.equal(cache.drain().resolveAll, true);
    assert.equal(cache.state.playerAccounts.get(200n)?.isEqual(ACCOUNTS[0]), true);

    t.allLinkedIntegration.upsert({id: 1n, accountIdentity: ACCOUNTS[0], provider: "bitcraft-ea2", externalId: "200", revokedAt: Timestamp.now()});
    assert.equal(cache.drain().resolveAll, true);
    assert.equal(cache.state.playerAccounts.size, 0, "a revoked link no longer resolves");
});

test("a bounty rule is usable only with a valid filter that does not depend on the bounty it assigns, and its failure is reported once", () => {
    warnings.length = 0;
    const cache = createAppCache(spyLog);
    const t = tables(cache);
    cache.load(t.conn);

    t.allBountyRule.upsert(flatRule("good", ACCOUNTS[0], JSON.stringify({field: "tier", cmp: "gte", value: 2})));
    t.allBountyRule.upsert(flatRule("circular", ACCOUNTS[0], JSON.stringify({field: "payout", cmp: "gte", value: 1})));
    t.allBountyRule.upsert(flatRule("broken", ACCOUNTS[0], "{not json"));
    assert.deepEqual(cache.state.bountyRules.get(ACCOUNTS[0].toHexString())?.map(spec => spec.id), ["good"]);
    t.allBountyRule.upsert(flatRule("good", ACCOUNTS[0], JSON.stringify({field: "tier", cmp: "gte", value: 3})));
    assert.equal(cache.state.bountyRules.get(ACCOUNTS[0].toHexString())?.length, 1);
    assert.equal(warnings.length, 2, "each unusable rule warns once, however often rules are rebuilt");

    t.allBountyRule.upsert(flatRule("good", ACCOUNTS[0], JSON.stringify({field: "tier", cmp: "gte", value: 3}), {deletedAt: Timestamp.now()}));
    assert.equal(cache.state.bountyRules.has(ACCOUNTS[0].toHexString()), false, "a tombstoned rule is gone");
});

test("a craft's assignment survives the old table's delete arriving after the new table's insert", () => {
    const cache = createAppCache(spyLog);
    const t = tables(cache);
    const row = {craftId: 9n, ratioNumerator: 1n, ratioDenominator: 4n, currency: "hex-coin", assignedByAccountIdentity: ACCOUNTS[0]};
    t.allCraftBountyAssignment.upsert(row);
    t.allPrivateCraftBountyAssignment.upsert(row);
    t.allCraftBountyAssignment.remove("9");
    assert.equal(cache.state.assignments.get(9n)?.private, true);
});
