/**
 * bounty-sink.ts — resolves and writes `craft_bounty_assignment`/`craft_bounty_entitlement`.
 * The bot is the sole writer of both tables: only it can see prism's craft/claim ownership *and*
 * `brico-app`'s rules/overrides at the same time.
 *
 * `resolveCraftBounty` mirrors `notification-sink.ts`'s fire-and-forget reducer-call style for the
 * actual writes, but every write here is a full upsert/delete rather than an insert-only append:
 * each tick's resolved bounties are diffed against what the tables already hold, so a failed write
 * is retried and an unchanged resolution is simply skipped.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {BountyEntitlementTotal, BountyRuleValue, CraftBountyOverride, LoyaltyBonusTotal, LoyaltyRule} from "@brico/bindings/brico-app/types";
import type {ClaimMember} from "@brico/bindings/prism/types";
import {addRatio, bonusFromMultiplier, reduceRatio} from "@brico/crafts/entitlement";
import type {ClaimAccessFlag, CraftSubject} from "@brico/crafts/filter";
import {claimAccessFlags} from "@brico/crafts/subject";
import {Identity, Timestamp} from "spacetimedb";

import {compiledFilter} from "../compiled-filter.ts";
import type {Logger} from "../log.ts";
import {startStep, timeReducerCall} from "../metrics.ts";
import type {CraftSnapshot} from "../relay/prism.ts";
import type {AssignedBounty, CraftRow} from "../relay/subject.ts";
import {
    type BountyRuleSpec,
    loadAssignments,
    loadBountyEntitlementTotals,
    loadBountyRules,
    loadEntitlements,
    loadLoyaltyBonusTotals,
    loadLoyaltyRewards,
    loadLoyaltyRules,
    loadOverrides,
    resolvePlayerAccounts,
} from "./bounty-source.ts";
import type {BricoAppConnection} from "./connection.ts";

interface ResolvedBounty {
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    currency: string;
    assignedByAccountIdentity: Identity;
    /** Whether the matched rule/override was marked private — decides which of the two assignment tables `assign()` writes to. */
    private: boolean;
}

/**
 * First priority-ordered rule whose filter matches `subject`. A grid rule's missing/empty cell for
 * this craft's `(skill, tier)` means "no bounty from this row," not "any bounty" — falls through
 * to the next rule rather than stopping here.
 */
function matchRules(subject: CraftSubject, specs: readonly BountyRuleSpec[], accountIdentity: Identity): ResolvedBounty | null {
    for (const spec of specs) {
        if (!compiledFilter(spec.filter)(subject)) continue;
        const value: BountyRuleValue = spec.value;

        if (value.tag === "Flat") {
            return {
                ratioNumerator: value.value.ratioNumerator,
                ratioDenominator: value.value.ratioDenominator,
                currency: value.value.currency,
                assignedByAccountIdentity: accountIdentity,
                private: spec.private,
            };
        }

        if (subject.skill === null || subject.tier === null) continue;
        const cell = value.value.cells.find(c => c.skillId === subject.skill && c.tier === subject.tier);
        if (!cell) continue;
        return {
            ratioNumerator: cell.ratioNumerator,
            ratioDenominator: cell.ratioDenominator,
            currency: value.value.currency,
            assignedByAccountIdentity: accountIdentity,
            private: spec.private,
        };
    }
    return null;
}

/**
 * Resolves one craft's bounty: override first (only if its account actually owns the craft or its
 * claim — an override belonging to neither is invalid intent and is skipped, falling through to
 * rule evaluation exactly as if it didn't exist), then the personal owner's rules, then the claim
 * owner's — **the personal owner wins outright** if they have any match at all.
 */
export function resolveCraftBounty(
    craftId: bigint,
    subject: CraftSubject,
    ownerEntityId: bigint,
    claimEntityId: bigint,
    playerAccounts: ReadonlyMap<bigint, Identity>,
    claimOwners: ReadonlyMap<bigint, bigint[]>,
    rulesByAccount: ReadonlyMap<string, BountyRuleSpec[]>,
    overridesByCraft: ReadonlyMap<bigint, CraftBountyOverride>,
): ResolvedBounty | null {
    const ownerAccount = ownerEntityId !== 0n ? playerAccounts.get(ownerEntityId) : undefined;
    const claimOwnerAccounts = (claimEntityId !== 0n ? claimOwners.get(claimEntityId) ?? [] : [])
        .map(playerId => playerAccounts.get(playerId))
        .filter((identity): identity is Identity => identity !== undefined);

    const override = overridesByCraft.get(craftId);
    if (override) {
        const ownsIt = (ownerAccount?.isEqual(override.accountIdentity) ?? false)
            || claimOwnerAccounts.some(identity => identity.isEqual(override.accountIdentity));
        if (ownsIt) {
            return {
                ratioNumerator: override.ratioNumerator,
                ratioDenominator: override.ratioDenominator,
                currency: override.currency,
                assignedByAccountIdentity: override.accountIdentity,
                private: override.private,
            };
        }
    }

    if (ownerAccount) {
        const resolved = matchRules(subject, rulesByAccount.get(ownerAccount.toHexString()) ?? [], ownerAccount);
        if (resolved) return resolved;
    }

    for (const claimOwnerAccount of claimOwnerAccounts) {
        const resolved = matchRules(subject, rulesByAccount.get(claimOwnerAccount.toHexString()) ?? [], claimOwnerAccount);
        if (resolved) return resolved;
    }

    return null;
}

/**
 * A payee's total effort for one payer, either for one specific `currency` or (when `currency` is
 * `undefined`, an `effortThreshold` rule's `allCurrencies: true`) summed across every currency that
 * payer has ever bountied them in. Reads whatever `bounty_entitlement_total` last committed as of
 * the start of the current tick — this tick's own in-flight `upsertCraftBountyEntitlement` calls
 * haven't round-tripped back into the bot's subscribed table state yet, so this is naturally "before
 * the current deltas" with no special handling needed.
 */
function effortFor(
    entitlementTotals: ReadonlyMap<string, BountyEntitlementTotal>,
    payer: Identity,
    playerId: bigint,
    currency: string | undefined,
): bigint {
    if (currency !== undefined) {
        return entitlementTotals.get(`${payer.toHexString()}:${playerId}:${currency}`)?.totalEffort ?? 0n;
    }
    let sum = 0n;
    for (const total of entitlementTotals.values()) {
        if (total.payeePlayerId === playerId && total.payerAccountIdentity.isEqual(payer)) sum += total.totalEffort;
    }
    return sum;
}

/**
 * Every currently-satisfied `loyalty_rule` bonus for one (payer, payee, currency), summed as an
 * exact bonus fraction (see `@brico/crafts/entitlement`'s `addRatio` — several bonuses add, they
 * never compound). `claimMembers` is `snapshot.claimMembers`, already loaded for *every*
 * claim/player pair in the game (not narrowed to craft owners), so a claim-membership rule naming
 * any claim id and any contributor is answerable with no new prism subscription.
 *
 * `rule.bonusRatioNumerator`/`bonusRatioDenominator` is **already a bonus-only fraction** (e.g.
 * `1/40` for +2.5%) — unlike `loyalty_reward`'s `ratioNumerator`/`ratioDenominator`, which is a
 * multiplier (>=1) and needs `bonusFromMultiplier` to convert it. `upsertLoyaltyRule`'s caller (the
 * frontend's `RuleRow`) does that conversion once, at input time, before ever calling the reducer —
 * applying it again here would double-convert (e.g. a stored `1/40` becoming `(1-40)/40 = -97.5%`),
 * which is exactly the bug that produced wildly negative resolved totals before this fix.
 */
export function resolveAutomaticBonus(
    rules: readonly LoyaltyRule[],
    claimMembers: ReadonlyMap<string, ClaimMember>,
    entitlementTotals: ReadonlyMap<string, BountyEntitlementTotal>,
    payer: Identity,
    playerId: bigint,
    currency: string,
): {numerator: bigint; denominator: bigint} {
    let bonus = {numerator: 0n, denominator: 1n};
    for (const rule of rules) {
        if (rule.currency !== currency) continue;
        const satisfied = rule.spec.tag === "ClaimMembership"
            ? claimAccessFlags(claimMembers.get(`${rule.spec.value.claimEntityId}:${playerId}`))
                .includes(rule.spec.value.requiredAccess as ClaimAccessFlag)
            : effortFor(entitlementTotals, payer, playerId, rule.spec.value.allCurrencies ? undefined : currency)
                >= rule.spec.value.threshold;
        if (!satisfied) continue;
        bonus = addRatio(bonus, {numerator: rule.bonusRatioNumerator, denominator: rule.bonusRatioDenominator});
    }
    return bonus;
}

/**
 * Writes (or clears) `loyalty_bonus_total` for one (payer, payee, currency) if `bonus` differs from
 * what was last resolved — the diff-and-no-op-when-unchanged half both `updateEntitlements`'s
 * per-craft loop and the full `resyncLoyaltyBonuses` pass share, so there is one code path for
 * "recompute and write this triple's automated bonus," not two hand-copies.
 */
function writeLoyaltyBonusIfChanged(
    conn: DbConnection,
    scoped: Logger,
    existingBonusTotals: ReadonlyMap<string, LoyaltyBonusTotal>,
    payer: Identity,
    playerId: bigint,
    currency: string,
    bonus: {numerator: bigint; denominator: bigint},
): void {
    const key = `${payer.toHexString()}:${playerId}:${currency}`;
    const previous = existingBonusTotals.get(key);
    const previousBonus = previous
        ? {numerator: previous.bonusRatioNumerator, denominator: previous.bonusRatioDenominator}
        : {numerator: 0n, denominator: 1n};
    if (bonus.numerator === previousBonus.numerator && bonus.denominator === previousBonus.denominator) return;

    if (bonus.numerator === 0n) {
        if (!previous) return;
        timeReducerCall("delete_loyalty_bonus_total", conn.reducers.deleteLoyaltyBonusTotal({
            payerAccountIdentity: payer, payeePlayerId: playerId, currency,
        })).catch(cause => {
            scoped.error("delete_loyalty_bonus_total failed", {payer: payer.toHexString(), playerId: playerId.toString(), currency, error: cause instanceof Error ? cause.message : String(cause)});
        });
    } else {
        timeReducerCall("upsert_loyalty_bonus_total", conn.reducers.upsertLoyaltyBonusTotal({
            payerAccountIdentity: payer, payeePlayerId: playerId, currency,
            bonusRatioNumerator: bonus.numerator, bonusRatioDenominator: bonus.denominator, updatedAt: Timestamp.now(),
        })).catch(cause => {
            scoped.error("upsert_loyalty_bonus_total failed", {payer: payer.toHexString(), playerId: playerId.toString(), currency, error: cause instanceof Error ? cause.message : String(cause)});
        });
    }
}

/**
 * A craft assigned a bounty within this long of prism first seeing it has all its effort counted,
 * since contributions in the gap before the bot's first snapshot are not "pre-bounty".
 */
export const FRESH_CRAFT_WINDOW_MS = 5000n;

/**
 * Pre-bounty effort `assignCraftBounty` should protect (treat as unpaid) on a craft's first
 * assignment: everyone's current effort, or nothing for a fresh craft. Compares prism's
 * `craft_meta.firstSeen` to the bot's clock, so skew beyond the window misclassifies.
 */
export function assignmentBaselines(
    byPlayer: ReadonlyMap<bigint, bigint> | undefined,
    firstSeenMs: bigint,
    nowMs: bigint,
): {playerId: bigint; effort: bigint}[] {
    if (byPlayer === undefined) return [];
    if (nowMs - firstSeenMs <= FRESH_CRAFT_WINDOW_MS) return [];
    return [...byPlayer].map(([playerId, effort]) => ({playerId, effort}));
}

function sameMap<K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>): boolean {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) if (b.get(key) !== value) return false;
    return true;
}

/** Whether two rule sets hold the same rules in the same order; parsed filters are cached per rule, so unchanged rules compare equal by reference. */
function sameRules(a: ReadonlyMap<string, BountyRuleSpec[]>, b: ReadonlyMap<string, BountyRuleSpec[]>): boolean {
    if (a.size !== b.size) return false;
    for (const [account, specs] of a) {
        const other = b.get(account);
        if (!other || other.length !== specs.length) return false;
        for (let i = 0; i < specs.length; i++) {
            const x = specs[i]!, y = other[i]!;
            if (x.id !== y.id || x.priority !== y.priority || x.filter !== y.filter || x.value !== y.value || x.private !== y.private) return false;
        }
    }
    return true;
}

/** Keys whose value was added, removed, or replaced between `before` and `after`. */
function changedKeys<K, V>(before: ReadonlyMap<K, V>, after: ReadonlyMap<K, V>): K[] {
    const keys: K[] = [];
    for (const [key, value] of after) if (before.get(key) !== value) keys.push(key);
    for (const key of before.keys()) if (!after.has(key)) keys.push(key);
    return keys;
}

/** Which crafts `BountyEngine.assign` has to re-resolve this tick. */
export interface AssignScope {
    /** Re-resolve every row rather than only `changed` (first call, cache reload). */
    full: boolean;
    /** Rows (without bounties) whose subject, owner or claim changed, or whose claim's owners changed. */
    changed: readonly CraftRow[];
    /** An open craft's row (without bounty) by id; `undefined` when the craft isn't open. */
    rowOf(craftId: bigint): CraftRow | undefined;
}

export interface BountyEngine {
    /**
     * Brings every open craft's bounty up to date against current `brico-app` state, writes any
     * that differ from the stored assignments, and returns the `craftId -> bounty` map of crafts
     * that have one (valid until the next call) — feed this into the row cache so
     * `CraftSubject.payout` is live before watches are evaluated in the same tick.
     *
     * With a `scope`, only `scope.changed` rows (plus crafts whose override changed) are re-resolved
     * unless the rules or player-account links changed, which re-resolves everything; without one,
     * every row in `rows` is resolved. `rows` is only iterated when everything is re-resolved.
     */
    assign(snapshot: CraftSnapshot, rows: Iterable<CraftRow>, scope?: AssignScope): ReadonlyMap<bigint, AssignedBounty>;
    /** Recomputes and writes any changed per-contributor entitlements for the given assignments. */
    updateEntitlements(snapshot: CraftSnapshot, assignments: ReadonlyMap<bigint, AssignedBounty>): void;
    /**
     * Recomputes `loyalty_bonus_total` for every (payer, payee, currency) triple known to
     * `bounty_entitlement_total` — not just whoever has a live contribution this tick. A no-op
     * unless a resync is actually pending (startup, a claim-membership change, or a loyalty
     * rule/reward edit — see `markMembershipChanged`/`markLoyaltyRulesChanged`), and a no-op again if
     * `brico-app` isn't live yet (the pending flag stays set and is retried next tick).
     */
    resyncLoyaltyBonuses(snapshot: CraftSnapshot): void;
    /** Marks a loyalty-bonus resync pending — call on any `claim_member` row change. */
    markMembershipChanged(): void;
    /** Marks a loyalty-bonus resync pending — call on any `loyalty_rule`/`loyalty_reward` row change. */
    markLoyaltyRulesChanged(): void;
}

export function createBountyEngine(app: BricoAppConnection, log: Logger): BountyEngine {
    const scoped = log.child("bounty");
    // Every open craft's resolved bounty, carried across ticks and patched by `assign()`. Its
    // `assignedByAccountIdentity` is the payer `updateEntitlements` keys its loyalty-reward lookup
    // on; that call always follows `assign()` in the same tick (see `bridge.ts`'s `tick`).
    let resolved = new Map<bigint, ResolvedBounty>();
    // The rule/account/override inputs `resolved` was computed from, to notice when they change.
    let inputs: {accounts: ReadonlyMap<bigint, Identity>; rules: ReadonlyMap<string, BountyRuleSpec[]>; overrides: ReadonlyMap<bigint, CraftBountyOverride>} | null = null;
    // Starts `true` so the very first opportunity (once both connections are ready) runs one full
    // `resyncLoyaltyBonuses` pass — see that method's doc comment for the other two triggers.
    let loyaltyResyncPending = true;

    return {
        assign(snapshot, rows, scope) {
            const conn = app.connection?.connection;
            if (!conn?.isActive) {
                resolved = new Map();
                inputs = null;
                return resolved;
            }

            let stop = startStep("assign_load_accounts");
            const playerAccounts = resolvePlayerAccounts(app);
            stop();
            stop = startStep("assign_load_rules");
            const rulesByAccount = loadBountyRules(app, scoped);
            stop();
            stop = startStep("assign_load_overrides");
            const overridesByCraft = loadOverrides(app);
            stop();
            stop = startStep("assign_load_assignments");
            const existingAssignments = loadAssignments(app);
            stop();

            stop = startStep("assign_resolve_loop");
            const rowIndex = scope ? undefined : new Map<bigint, CraftRow>();
            const rowOf = scope ? scope.rowOf : (craftId: bigint) => rowIndex?.get(craftId);
            const everything = !scope || scope.full || inputs === null
                || !sameMap(inputs.accounts, playerAccounts) || !sameRules(inputs.rules, rulesByAccount);

            const resolve = (row: CraftRow) => {
                const bounty = resolveCraftBounty(
                    row.entityId, row.subject, row.ownerEntityId, row.claimEntityId,
                    playerAccounts, snapshot.claimOwners, rulesByAccount, overridesByCraft,
                );
                if (bounty) resolved.set(row.entityId, bounty);
                else resolved.delete(row.entityId);
            };

            if (everything || !inputs) {
                resolved = new Map();
                for (const row of rows) {
                    rowIndex?.set(row.entityId, row);
                    resolve(row);
                }
            } else {
                for (const row of scope.changed) resolve(row);
                for (const craftId of changedKeys(inputs.overrides, overridesByCraft)) {
                    const row = rowOf(craftId);
                    if (row) resolve(row);
                }
                for (const craftId of [...resolved.keys()]) if (!rowOf(craftId)) resolved.delete(craftId);
            }
            inputs = {accounts: playerAccounts, rules: rulesByAccount, overrides: overridesByCraft};
            stop();

            stop = startStep("assign_write_loop");
            for (const [craftId, bounty] of resolved) {
                const previous = existingAssignments.get(craftId);
                const unchanged = previous !== undefined
                    && previous.ratioNumerator === bounty.ratioNumerator
                    && previous.ratioDenominator === bounty.ratioDenominator
                    && previous.currency === bounty.currency
                    && previous.assignedByAccountIdentity.isEqual(bounty.assignedByAccountIdentity)
                    && previous.private === bounty.private;
                if (unchanged) continue;

                const row = rowOf(craftId);
                timeReducerCall("assign_craft_bounty", conn.reducers.assignCraftBounty({
                    craftId,
                    ratioNumerator: bounty.ratioNumerator,
                    ratioDenominator: bounty.ratioDenominator,
                    currency: bounty.currency,
                    assignedByAccountIdentity: bounty.assignedByAccountIdentity,
                    private: bounty.private,
                    assignedAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    // Only a craft with no assignment as of last tick needs baselines.
                    baselines: previous === undefined && row
                        ? assignmentBaselines(snapshot.contributions.get(craftId), row.firstSeenMs, BigInt(Date.now()))
                        : [],
                })).catch(cause => {
                    scoped.error("assign_craft_bounty failed", {craftId: craftId.toString(), error: cause instanceof Error ? cause.message : String(cause)});
                });
            }

            // A stored assignment with no resolved bounty is cleared if its craft is open (the bounty
            // went away) or gone from `craft_meta` entirely (past the 24-hour Claimed/Removed tail —
            // see `isOpen` in prism.ts); one on a closed craft still in that tail is left alone.
            for (const craftId of existingAssignments.keys()) {
                if (resolved.has(craftId)) continue;
                if (!rowOf(craftId) && snapshot.allCraftIds.has(craftId)) continue;
                timeReducerCall("clear_craft_bounty", conn.reducers.clearCraftBounty({craftId})).catch(cause => {
                    scoped.error("clear_craft_bounty failed", {craftId: craftId.toString(), error: cause instanceof Error ? cause.message : String(cause)});
                });
            }
            stop();

            return resolved;
        },

        updateEntitlements(snapshot, assignments) {
            const conn = app.connection?.connection;
            if (!conn?.isActive) return;

            let stop = startStep("ent_load");
            const existing = loadEntitlements(app);
            const loyaltyRewards = loadLoyaltyRewards(app);
            const loyaltyRulesByPayer = loadLoyaltyRules(app);
            const entitlementTotals = loadBountyEntitlementTotals(app);
            const loyaltyBonusTotals = loadLoyaltyBonusTotals(app);
            stop();

            stop = startStep("ent_loop");
            for (const [craftId, bounty] of assignments) {
                const byPlayer = snapshot.contributions.get(craftId);
                if (!byPlayer) continue;
                for (const [playerId, effort] of byPlayer) {
                    // Every bonus (manual assignment + every currently-satisfied automated rule)
                    // folds into the bounty ratio *before* the floor the module applies to new
                    // effort, keeping this a single floor operation per conversion. This makes
                    // `craft_bounty_entitlement`/`bounty_entitlement_total` the loyalty-adjusted
                    // ("actual") ledger; the frontend's estimated-payout preview never sees a
                    // multiplier and keeps using the raw assigned ratio.
                    const assignedByAccountIdentity = resolved.get(craftId)?.assignedByAccountIdentity;
                    let effectiveRatio = {numerator: bounty.ratioNumerator, denominator: bounty.ratioDenominator};
                    if (assignedByAccountIdentity) {
                        const loyalty = loyaltyRewards.get(`${assignedByAccountIdentity.toHexString()}:${playerId}:${bounty.currency}`);
                        const manualBonus = loyalty ? bonusFromMultiplier(loyalty.ratioNumerator, loyalty.ratioDenominator) : {numerator: 0n, denominator: 1n};
                        const automaticBonus = resolveAutomaticBonus(
                            loyaltyRulesByPayer.get(assignedByAccountIdentity.toHexString()) ?? [],
                            snapshot.claimMembers, entitlementTotals, assignedByAccountIdentity, playerId, bounty.currency,
                        );
                        const totalBonus = addRatio(manualBonus, automaticBonus);
                        if (totalBonus.numerator !== 0n) {
                            effectiveRatio = reduceRatio(
                                bounty.ratioNumerator * (totalBonus.numerator + totalBonus.denominator),
                                bounty.ratioDenominator * totalBonus.denominator,
                            );
                        }
                        writeLoyaltyBonusIfChanged(conn, scoped, loyaltyBonusTotals, assignedByAccountIdentity, playerId, bounty.currency, automaticBonus);
                    }

                    // The module owns the actual conversion math (new effort at *this* ratio, plus
                    // whatever it's carrying in `remainderEffort`) — this call only ever hands over
                    // current facts (cumulative effort, current ratio), never a precomputed total, so
                    // a rate change here only prices effort from here on, never revalues the past. See
                    // `upsertCraftBountyEntitlement`'s doc comment.
                    const id = `${craftId}:${playerId}:${bounty.currency}`;
                    const previous = existing.get(id);
                    if (previous && previous.lastAssignedEffort === effort) continue;

                    timeReducerCall("upsert_craft_bounty_entitlement", conn.reducers.upsertCraftBountyEntitlement({
                        craftId,
                        playerId,
                        currency: bounty.currency,
                        effort,
                        ratioNumerator: effectiveRatio.numerator,
                        ratioDenominator: effectiveRatio.denominator,
                        updatedAt: Timestamp.now(),
                    })).catch(cause => {
                        scoped.error("upsert_craft_bounty_entitlement failed", {
                            craftId: craftId.toString(),
                            playerId: playerId.toString(),
                            error: cause instanceof Error ? cause.message : String(cause),
                        });
                    });
                }
            }
            stop();
        },

        resyncLoyaltyBonuses(snapshot) {
            if (!loyaltyResyncPending) return;
            const conn = app.connection?.connection;
            if (!conn?.isActive || !app.isLive) return;
            loyaltyResyncPending = false;

            const rulesByPayer = loadLoyaltyRules(app);
            const entitlementTotals = loadBountyEntitlementTotals(app);
            const bonusTotals = loadLoyaltyBonusTotals(app);

            for (const total of entitlementTotals.values()) {
                const automaticBonus = resolveAutomaticBonus(
                    rulesByPayer.get(total.payerAccountIdentity.toHexString()) ?? [],
                    snapshot.claimMembers, entitlementTotals,
                    total.payerAccountIdentity, total.payeePlayerId, total.currency,
                );
                writeLoyaltyBonusIfChanged(conn, scoped, bonusTotals, total.payerAccountIdentity, total.payeePlayerId, total.currency, automaticBonus);
            }
        },

        markMembershipChanged() {
            loyaltyResyncPending = true;
        },

        markLoyaltyRulesChanged() {
            loyaltyResyncPending = true;
        },
    };
}
