/**
 * app-cache.ts — the `brico-app` tables the bounty engine reads, mirrored from row callbacks, with
 * `drain()` reporting what changed since the previous drain.
 *
 * Callbacks only update the mirrored maps and record what became dirty. `load` + `findAppDrift` are
 * the full-read path the cache is seeded from and checked against.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {
    BountyEntitlementTotal,
    BountyRule,
    BountyRuleValue,
    CraftBountyEntitlement,
    CraftBountyOverride,
    LoyaltyBonusTotal,
    LoyaltyReward,
    LoyaltyRule,
} from "@brico/bindings/brico-app/types";
import {type FilterNode, parseFilter, validateFilter} from "@brico/crafts/filter";
import {isDeepStrictEqual} from "node:util";
import type {Identity} from "spacetimedb";

import {createLogger, type Logger} from "../log.ts";
import {keyedFeed, type TableFeed} from "../spacetime/feed.ts";

/** A `bounty_rule` row with its `filterJson` already parsed and validated. */
export interface BountyRuleSpec {
    id: string;
    priority: number;
    filter: FilterNode;
    value: BountyRuleValue;
    private: boolean;
}

/**
 * A stored assignment from either table. `private` is tagged on here: neither
 * `craft_bounty_assignment` nor `craft_private_bounty_assignment` stores it, which table a craft's
 * row lives in *is* its privacy.
 */
export interface ExistingBountyAssignment {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    assignedByAccountIdentity: Identity;
    private: boolean;
}

/** A (payer, payee, currency) ledger key. */
export interface Triple {
    payer: Identity;
    payee: bigint;
    currency: string;
}

export function tripleKey(payer: Identity, payee: bigint, currency: string): string {
    return `${payer.toHexString()}:${payee}:${currency}`;
}

type Db = DbConnection["db"];
type RowOf<K extends keyof Db> = Db[K] extends {iter(): Iterable<infer R>} ? R : never;
type LinkedIntegration = RowOf<"allLinkedIntegration">;
type Assignment = RowOf<"allCraftBountyAssignment">;

/** The mirrored tables. Maps are mutated by callbacks, so read them synchronously. */
export interface AppState {
    /** `bitcraft-ea2` player entity id -> the brico account it is linked to, revoked links excluded. */
    readonly playerAccounts: ReadonlyMap<bigint, Identity>;
    /** Every account's usable bounty rules by account identity hex, in evaluation order (priority, then id). */
    readonly bountyRules: ReadonlyMap<string, BountyRuleSpec[]>;
    readonly overrides: ReadonlyMap<bigint, CraftBountyOverride>;
    /** Both assignment tables; they are mutually exclusive per craft. */
    readonly assignments: ReadonlyMap<bigint, ExistingBountyAssignment>;
    /** Keyed `craftId:playerId:currency`. */
    readonly entitlements: ReadonlyMap<string, CraftBountyEntitlement>;
    /** Keyed by `tripleKey`. */
    readonly loyaltyRewards: ReadonlyMap<string, LoyaltyReward>;
    /** Every payer's automated loyalty rules by payer identity hex, ordered by id; rules add, so order never matters. */
    readonly loyaltyRules: ReadonlyMap<string, LoyaltyRule[]>;
    /** Keyed by `tripleKey`. */
    readonly entitlementTotals: ReadonlyMap<string, BountyEntitlementTotal>;
    /** Keyed by `tripleKey`. */
    readonly loyaltyBonusTotals: ReadonlyMap<string, LoyaltyBonusTotal>;
    /** `entitlementTotals` keys for one payee / one payer (identity hex). */
    readonly totalKeysByPayee: ReadonlyMap<bigint, ReadonlySet<string>>;
    readonly totalKeysByPayer: ReadonlyMap<string, ReadonlySet<string>>;
}

/** What `drain()` found changed since the previous drain. */
export interface AppDelta {
    /** True after `load`/`requestFull`: every step should re-evaluate from scratch rather than apply a delta. */
    full: boolean;
    /** Linked accounts or bounty rules changed, so any craft's resolved bounty may differ. */
    resolveAll: boolean;
    overrideCrafts: Set<bigint>;
    /** Crafts whose stored assignment row changed (including the bot's own writes arriving back). */
    assignmentCrafts: Set<bigint>;
    /** `bounty_entitlement_total` triples that changed, by `tripleKey`. */
    totals: Map<string, Triple>;
    /** Payers (identity hex) whose automated loyalty rules changed. */
    loyaltyRulePayers: Set<string>;
}

export function emptyAppDelta(full = false): AppDelta {
    return {full, resolveAll: false, overrideCrafts: new Set(), assignmentCrafts: new Set(), totals: new Map(), loyaltyRulePayers: new Set()};
}

export interface AppCache {
    readonly linkedIntegration: TableFeed<LinkedIntegration>;
    readonly bountyRule: TableFeed<BountyRule>;
    readonly craftBountyOverride: TableFeed<CraftBountyOverride>;
    readonly craftBountyAssignment: TableFeed<Assignment>;
    readonly privateCraftBountyAssignment: TableFeed<Assignment>;
    readonly craftBountyEntitlement: TableFeed<CraftBountyEntitlement>;
    readonly loyaltyReward: TableFeed<LoyaltyReward>;
    readonly loyaltyRule: TableFeed<LoyaltyRule>;
    readonly loyaltyBonusTotal: TableFeed<LoyaltyBonusTotal>;
    readonly bountyEntitlementTotal: TableFeed<BountyEntitlementTotal>;

    /** Replaces everything with a full read of `conn`'s tables and makes the next drain `full`. */
    load(conn: DbConnection): void;
    /** Makes the next drain `full`. */
    requestFull(): void;
    drain(): AppDelta;
    readonly state: AppState;
}

function addTo<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
    const set = index.get(key);
    if (set) set.add(value);
    else index.set(key, new Set([value]));
}

function removeFrom<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
    const set = index.get(key);
    if (!set) return;
    set.delete(value);
    if (set.size === 0) index.delete(key);
}

export function createAppCache(log: Logger): AppCache {
    const links = new Map<bigint, LinkedIntegration>();
    const rules = new Map<string, BountyRule>();
    const overrides = new Map<bigint, CraftBountyOverride>();
    const assignments = new Map<bigint, ExistingBountyAssignment>();
    const entitlements = new Map<string, CraftBountyEntitlement>();
    const loyaltyRewards = new Map<string, LoyaltyReward>();
    const loyaltyRuleRows = new Map<bigint, LoyaltyRule>();
    const entitlementTotals = new Map<string, BountyEntitlementTotal>();
    const loyaltyBonusTotals = new Map<string, LoyaltyBonusTotal>();
    const totalKeysByPayee = new Map<bigint, Set<string>>();
    const totalKeysByPayer = new Map<string, Set<string>>();

    // Derived from `links`/`rules`/`loyaltyRuleRows`, rebuilt on first read after one of them changes.
    let playerAccountsView: Map<bigint, Identity> | null = null;
    let bountyRulesView: Map<string, BountyRuleSpec[]> | null = null;
    let loyaltyRulesView: Map<string, LoyaltyRule[]> | null = null;
    // Parsed filter per rule id, valid while its `filterJson` is unchanged; `null` = unusable (already warned about).
    const parsedFilters = new Map<string, {json: string; filter: FilterNode | null}>();

    let delta = emptyAppDelta();

    /** Parses and validates a rule's filter. A rule that conditions on `payout`/`currency` is skipped, since it would depend on the bounty it assigns. */
    function parseRuleFilter(rule: BountyRule): FilterNode | null {
        const cached = parsedFilters.get(rule.id);
        if (cached && cached.json === rule.filterJson) return cached.filter;

        let filter: FilterNode | null = null;
        try {
            const parsedJson: unknown = JSON.parse(rule.filterJson);
            const problems = validateFilter(parsedJson, "filter", ["payout", "currency"]);
            if (problems.length > 0) {
                log.warn("skipping bounty rule: invalid or disallowed filter", {ruleId: rule.id, problems: problems.join("; ")});
            } else {
                filter = parseFilter(parsedJson);
                if (!filter) log.warn("skipping bounty rule: filter did not parse", {ruleId: rule.id});
            }
        } catch {
            log.warn("skipping bounty rule: filterJson is not valid JSON", {ruleId: rule.id});
        }
        parsedFilters.set(rule.id, {json: rule.filterJson, filter});
        return filter;
    }

    function buildBountyRules(): Map<string, BountyRuleSpec[]> {
        const byAccount = new Map<string, BountyRuleSpec[]>();
        for (const rule of rules.values()) {
            const filter = parseRuleFilter(rule);
            if (!filter) continue;
            const key = rule.accountIdentity.toHexString();
            const spec: BountyRuleSpec = {id: rule.id, priority: rule.priority, filter, value: rule.value, private: rule.private};
            const specs = byAccount.get(key);
            if (specs) specs.push(spec);
            else byAccount.set(key, [spec]);
        }
        for (const id of parsedFilters.keys()) if (!rules.has(id)) parsedFilters.delete(id);
        for (const specs of byAccount.values()) specs.sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return byAccount;
    }

    function buildLoyaltyRules(): Map<string, LoyaltyRule[]> {
        const byPayer = new Map<string, LoyaltyRule[]>();
        for (const rule of loyaltyRuleRows.values()) {
            const key = rule.payerAccountIdentity.toHexString();
            const list = byPayer.get(key);
            if (list) list.push(rule);
            else byPayer.set(key, [rule]);
        }
        for (const list of byPayer.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return byPayer;
    }

    function setLink(row: LinkedIntegration): void {
        if (row.provider !== "bitcraft-ea2" || row.revokedAt !== undefined) {
            removeLink(row);
            return;
        }
        links.set(row.id, row);
        playerAccountsView = null;
        delta.resolveAll = true;
    }

    function removeLink(row: LinkedIntegration): void {
        if (!links.delete(row.id)) return;
        playerAccountsView = null;
        delta.resolveAll = true;
    }

    function setRule(row: BountyRule): void {
        if (row.deletedAt !== undefined) {
            removeRule(row);
            return;
        }
        rules.set(row.id, row);
        bountyRulesView = null;
        delta.resolveAll = true;
    }

    function removeRule(row: BountyRule): void {
        if (!rules.delete(row.id)) return;
        bountyRulesView = null;
        delta.resolveAll = true;
    }

    const assignmentFeed = (isPrivate: boolean): TableFeed<Assignment> => keyedFeed(
        row => row.craftId,
        row => {
            assignments.set(row.craftId, {...row, private: isPrivate});
            delta.assignmentCrafts.add(row.craftId);
        },
        row => {
            // A craft moving between the two tables can deliver the new row before the old one's delete.
            if (assignments.get(row.craftId)?.private !== isPrivate) return;
            assignments.delete(row.craftId);
            delta.assignmentCrafts.add(row.craftId);
        },
    );

    function setLoyaltyRule(row: LoyaltyRule): void {
        loyaltyRuleRows.set(row.id, row);
        loyaltyRulesView = null;
        delta.loyaltyRulePayers.add(row.payerAccountIdentity.toHexString());
    }

    const entitlementKey = (row: CraftBountyEntitlement) => `${row.craftId}:${row.playerId}:${row.currency}`;

    function setTotal(row: BountyEntitlementTotal): void {
        const key = tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency);
        entitlementTotals.set(key, row);
        addTo(totalKeysByPayee, row.payeePlayerId, key);
        addTo(totalKeysByPayer, row.payerAccountIdentity.toHexString(), key);
        delta.totals.set(key, {payer: row.payerAccountIdentity, payee: row.payeePlayerId, currency: row.currency});
    }

    function removeTotal(row: BountyEntitlementTotal): void {
        const key = tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency);
        if (entitlementTotals.get(key)?.id !== row.id) return;
        entitlementTotals.delete(key);
        removeFrom(totalKeysByPayee, row.payeePlayerId, key);
        removeFrom(totalKeysByPayer, row.payerAccountIdentity.toHexString(), key);
        delta.totals.set(key, {payer: row.payerAccountIdentity, payee: row.payeePlayerId, currency: row.currency});
    }

    function reset(): void {
        for (const map of [links, rules, overrides, assignments, entitlements, loyaltyRewards, loyaltyRuleRows, entitlementTotals, loyaltyBonusTotals, totalKeysByPayee, totalKeysByPayer] as Map<unknown, unknown>[]) map.clear();
        playerAccountsView = null;
        bountyRulesView = null;
        loyaltyRulesView = null;
        parsedFilters.clear();
    }

    const cache: AppCache = {
        linkedIntegration: keyedFeed(row => row.id, setLink, removeLink),
        bountyRule: keyedFeed(row => row.id, setRule, removeRule),
        craftBountyOverride: keyedFeed(
            row => row.craftId,
            row => {
                overrides.set(row.craftId, row);
                delta.overrideCrafts.add(row.craftId);
            },
            row => {
                overrides.delete(row.craftId);
                delta.overrideCrafts.add(row.craftId);
            },
        ),
        craftBountyAssignment: assignmentFeed(false),
        privateCraftBountyAssignment: assignmentFeed(true),
        craftBountyEntitlement: keyedFeed(
            entitlementKey,
            row => void entitlements.set(entitlementKey(row), row),
            row => {
                if (entitlements.get(entitlementKey(row))?.id === row.id) entitlements.delete(entitlementKey(row));
            },
        ),
        loyaltyReward: keyedFeed(
            row => tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency),
            row => void loyaltyRewards.set(tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency), row),
            row => {
                const key = tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency);
                if (loyaltyRewards.get(key)?.id === row.id) loyaltyRewards.delete(key);
            },
        ),
        loyaltyRule: {
            insert: setLoyaltyRule,
            update(before, after) {
                delta.loyaltyRulePayers.add(before.payerAccountIdentity.toHexString());
                setLoyaltyRule(after);
            },
            delete(row) {
                if (!loyaltyRuleRows.delete(row.id)) return;
                loyaltyRulesView = null;
                delta.loyaltyRulePayers.add(row.payerAccountIdentity.toHexString());
            },
        },
        loyaltyBonusTotal: keyedFeed(
            row => tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency),
            row => void loyaltyBonusTotals.set(tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency), row),
            row => {
                const key = tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency);
                if (loyaltyBonusTotals.get(key)?.id === row.id) loyaltyBonusTotals.delete(key);
            },
        ),
        bountyEntitlementTotal: keyedFeed(
            row => tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency),
            setTotal,
            removeTotal,
        ),

        load(conn) {
            reset();
            const {db} = conn;
            for (const row of db.allLinkedIntegration.iter()) setLink(row);
            for (const row of db.allBountyRule.iter()) setRule(row);
            for (const row of db.allCraftBountyOverride.iter()) overrides.set(row.craftId, row);
            for (const row of db.allCraftBountyAssignment.iter()) assignments.set(row.craftId, {...row, private: false});
            for (const row of db.allPrivateCraftBountyAssignment.iter()) assignments.set(row.craftId, {...row, private: true});
            for (const row of db.allCraftBountyEntitlement.iter()) entitlements.set(entitlementKey(row), row);
            for (const row of db.allLoyaltyReward.iter()) loyaltyRewards.set(tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency), row);
            for (const row of db.allLoyaltyRule.iter()) loyaltyRuleRows.set(row.id, row);
            for (const row of db.allLoyaltyBonusTotal.iter()) loyaltyBonusTotals.set(tripleKey(row.payerAccountIdentity, row.payeePlayerId, row.currency), row);
            for (const row of db.allBountyEntitlementTotal.iter()) setTotal(row);
            delta = emptyAppDelta(true);
        },

        requestFull() {
            delta.full = true;
        },

        drain() {
            const drained = delta;
            delta = emptyAppDelta();
            return drained;
        },

        state: {
            get playerAccounts() {
                if (!playerAccountsView) {
                    playerAccountsView = new Map();
                    for (const link of links.values()) playerAccountsView.set(BigInt(link.externalId), link.accountIdentity);
                }
                return playerAccountsView;
            },
            get bountyRules() {
                return (bountyRulesView ??= buildBountyRules());
            },
            overrides,
            assignments,
            entitlements,
            loyaltyRewards,
            get loyaltyRules() {
                return (loyaltyRulesView ??= buildLoyaltyRules());
            },
            entitlementTotals,
            loyaltyBonusTotals,
            totalKeysByPayee,
            totalKeysByPayer,
        },
    };
    return cache;
}

const COMPARED: (keyof AppState)[] = [
    "playerAccounts", "bountyRules", "overrides", "assignments", "entitlements",
    "loyaltyRewards", "loyaltyRules", "entitlementTotals", "loyaltyBonusTotals",
];

/** The mirrored tables of `cache` that differ from a fresh full read of `conn`, or `null` when they all agree. */
export function findAppDrift(cache: AppCache, conn: DbConnection): string | null {
    // Quiet: the cache being checked has already warned about any unusable rule.
    const truth = createAppCache(createLogger("error"));
    truth.load(conn);
    const differing = COMPARED.filter(name => !isDeepStrictEqual(cache.state[name], truth.state[name]));
    return differing.length === 0 ? null : differing.join(", ");
}
