/**
 * bounty-sink.ts — resolves and writes `craft_bounty_assignment`, `craft_bounty_entitlement` and
 * `loyalty_bonus_total`. The bot is the sole writer of these tables: only it can see prism's
 * craft/claim ownership *and* `brico-app`'s rules/overrides at the same time.
 *
 * Each step works only on what a tick's `BountyScope` says changed, reading `brico-app` state from
 * the `AppCache`. Writes are fire-and-forget reducer calls diffed against the stored rows; a failed
 * write is retried on the next tick.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {BountyEntitlementTotal, BountyRuleValue, CraftBountyOverride, LoyaltyRule} from "@brico/bindings/brico-app/types";
import type {ClaimMember} from "@brico/bindings/prism/types";
import {addRatio, bonusFromMultiplier, reduceRatio} from "@brico/crafts/entitlement";
import type {ClaimAccessFlag, CraftSubject} from "@brico/crafts/filter";
import {claimAccessFlags} from "@brico/crafts/subject";
import {Identity, Timestamp} from "spacetimedb";

import {compiledFilter} from "../compiled-filter.ts";
import type {Logger} from "../log.ts";
import {startStep, timeReducerCall} from "../metrics.ts";
import type {CraftSnapshot} from "../relay/prism.ts";
import type {RowDelta} from "../relay/row-cache.ts";
import type {AssignedBounty, CraftRow} from "../relay/subject.ts";
import {type AppCache, type AppDelta, type BountyRuleSpec, type Triple, tripleKey} from "./app-cache.ts";
import type {BricoAppConnection} from "./connection.ts";

export interface ResolvedBounty {
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
 * the current deltas" with no special handling needed. `totalKeysByPayee` narrows the all-currencies
 * sum to the payee's own rows.
 */
function effortFor(
    entitlementTotals: ReadonlyMap<string, BountyEntitlementTotal>,
    totalKeysByPayee: ReadonlyMap<bigint, ReadonlySet<string>> | undefined,
    payer: Identity,
    playerId: bigint,
    currency: string | undefined,
): bigint {
    if (currency !== undefined) {
        return entitlementTotals.get(tripleKey(payer, playerId, currency))?.totalEffort ?? 0n;
    }
    let sum = 0n;
    const candidates = totalKeysByPayee ? [...(totalKeysByPayee.get(playerId) ?? [])].flatMap(key => entitlementTotals.get(key) ?? []) : entitlementTotals.values();
    for (const total of candidates) {
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
    totalKeysByPayee?: ReadonlyMap<bigint, ReadonlySet<string>>,
): {numerator: bigint; denominator: bigint} {
    let bonus = {numerator: 0n, denominator: 1n};
    for (const rule of rules) {
        if (rule.currency !== currency) continue;
        const satisfied = rule.spec.tag === "ClaimMembership"
            ? claimAccessFlags(claimMembers.get(`${rule.spec.value.claimEntityId}:${playerId}`))
                .includes(rule.spec.value.requiredAccess as ClaimAccessFlag)
            : effortFor(entitlementTotals, totalKeysByPayee, payer, playerId, rule.spec.value.allCurrencies ? undefined : currency)
                >= rule.spec.value.threshold;
        if (!satisfied) continue;
        bonus = addRatio(bonus, {numerator: rule.bonusRatioNumerator, denominator: rule.bonusRatioDenominator});
    }
    return bonus;
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

function sameBounty(a: ResolvedBounty, b: ResolvedBounty): boolean {
    return a.ratioNumerator === b.ratioNumerator
        && a.ratioDenominator === b.ratioDenominator
        && a.currency === b.currency
        && a.private === b.private
        && a.assignedByAccountIdentity.isEqual(b.assignedByAccountIdentity);
}

/** What one tick's steps have to look at: the prism row changes plus the `brico-app` changes. */
export interface BountyScope {
    /** Re-evaluate everything rather than only what changed (first tick, cache reload). */
    full: boolean;
    /** Rows (without bounties) whose subject, owner or claim changed, or whose claim's owners changed. */
    changed: readonly CraftRow[];
    /** Crafts that left the open set. */
    removed: readonly bigint[];
    /** Crafts whose `craft_meta` row was deleted outright. */
    deleted: ReadonlySet<bigint>;
    /** An open craft's row (without bounty) by id; `undefined` when the craft isn't open. */
    rowOf(craftId: bigint): CraftRow | undefined;
    /** Crafts whose contributions changed. */
    contributionCrafts: ReadonlySet<bigint>;
    /** Players whose claim membership changed. */
    memberPlayers: ReadonlySet<bigint>;
    app: AppDelta;
}

/** The scope for the tick whose changes are `delta` (prism) and `app`; `baseRows` is the row cache's rows without bounties. */
export function bountyScope(delta: RowDelta, app: AppDelta, baseRows: ReadonlyMap<string, CraftRow>): BountyScope {
    const changedIds = new Set<string>(delta.changed.map(row => row.id));
    for (const craftId of delta.ownerChangedCrafts) changedIds.add(craftId.toString());
    return {
        full: delta.full || app.full,
        changed: [...changedIds].flatMap(id => baseRows.get(id) ?? []),
        removed: delta.removedIds.map(id => BigInt(id)),
        deleted: delta.deletedCrafts,
        rowOf: craftId => baseRows.get(craftId.toString()),
        contributionCrafts: delta.contributionCrafts,
        memberPlayers: delta.memberPlayers,
        app,
    };
}

export interface AssignResult {
    /** `craftId -> bounty` for the open crafts that have one; the engine mutates it in place on later ticks. */
    bounties: ReadonlyMap<bigint, AssignedBounty>;
    /** Crafts whose resolved bounty differs from the previous call's. */
    changed: ReadonlySet<bigint>;
}

/** The three steps run once per tick, in this order. */
export interface BountyEngine {
    /**
     * Brings the bounty of every craft `scope` touches up to date against current `brico-app` state,
     * writes any that differ from the stored assignments, and returns the resolved bounties — feed
     * these into the row cache so `CraftSubject.payout` is live before watches are evaluated in the
     * same tick. A change to the bounty rules or player-account links re-resolves every open craft;
     * `rows` is only iterated then. Writes the assignment before `updateEntitlements` prices effort on it.
     */
    assign(snapshot: CraftSnapshot, rows: Iterable<CraftRow>, scope: BountyScope): AssignResult;
    /**
     * Prices new contributor effort into `craft_bounty_entitlement` for the crafts whose
     * contributions changed or whose bounty was just assigned or changed.
     */
    updateEntitlements(snapshot: CraftSnapshot, scope: BountyScope): void;
    /**
     * Recomputes `loyalty_bonus_total` for the (payer, payee, currency) triples known to
     * `bounty_entitlement_total` whose inputs changed: their total (or another currency's total of
     * the same payer and payee, for `allCurrencies` rules), the payee's claim membership, or the
     * payer's loyalty rules.
     */
    updateLoyaltyBonuses(snapshot: CraftSnapshot, scope: BountyScope): void;
}

export function createBountyEngine(app: BricoAppConnection, cache: AppCache, log: Logger): BountyEngine {
    const scoped = log.child("bounty");
    // Every open craft's resolved bounty, patched by `assign()`. `updateEntitlements` reads it, so
    // it always follows `assign()` in the same tick (see `bridge.ts`'s `tick`).
    let resolved = new Map<bigint, ResolvedBounty>();
    // `resolved` reflects a pass over every open craft; false until the first one, and after the connection drops.
    let primed = false;
    // Crafts whose bounty changed in `assign()`, waiting for `updateEntitlements` to price them.
    let unpriced = new Set<bigint>();
    let needFullPricing = true;
    let needFullLoyalty = true;
    // Work whose reducer call failed, retried next tick.
    const retryAssign = new Set<bigint>();
    const retryEntitlement = new Set<bigint>();
    const retryBonus = new Map<string, Triple>();
    // Triples whose bonus was already written this tick, since the stored rows haven't changed yet.
    const writtenBonus = new Set<string>();

    const liveConnection = (): DbConnection | null => {
        const conn = app.connection?.connection;
        return conn?.isActive && app.isLive ? conn : null;
    };

    /** Writes (or clears) `loyalty_bonus_total` for one triple if `bonus` differs from what is stored. */
    function writeBonus(conn: DbConnection, triple: Triple, bonus: {numerator: bigint; denominator: bigint}): void {
        const key = tripleKey(triple.payer, triple.payee, triple.currency);
        if (writtenBonus.has(key)) return;
        const previous = cache.state.loyaltyBonusTotals.get(key);
        const previousBonus = previous
            ? {numerator: previous.bonusRatioNumerator, denominator: previous.bonusRatioDenominator}
            : {numerator: 0n, denominator: 1n};
        if (bonus.numerator === previousBonus.numerator && bonus.denominator === previousBonus.denominator) return;
        if (bonus.numerator === 0n && !previous) return;
        writtenBonus.add(key);

        const fields = {payerAccountIdentity: triple.payer, payeePlayerId: triple.payee, currency: triple.currency};
        const failed = (reducer: string) => (cause: unknown) => {
            retryBonus.set(key, triple);
            scoped.error(`${reducer} failed`, {payer: triple.payer.toHexString(), playerId: triple.payee.toString(), currency: triple.currency, error: cause instanceof Error ? cause.message : String(cause)});
        };
        if (bonus.numerator === 0n) {
            timeReducerCall("delete_loyalty_bonus_total", conn.reducers.deleteLoyaltyBonusTotal(fields)).catch(failed("delete_loyalty_bonus_total"));
        } else {
            timeReducerCall("upsert_loyalty_bonus_total", conn.reducers.upsertLoyaltyBonusTotal({
                ...fields, bonusRatioNumerator: bonus.numerator, bonusRatioDenominator: bonus.denominator, updatedAt: Timestamp.now(),
            })).catch(failed("upsert_loyalty_bonus_total"));
        }
    }

    return {
        assign(snapshot, rows, scope) {
            const conn = liveConnection();
            if (!conn) {
                const previous = resolved;
                resolved = new Map();
                primed = false;
                needFullPricing = true;
                needFullLoyalty = true;
                return {bounties: resolved, changed: new Set(previous.keys())};
            }

            const state = cache.state;
            const everything = !primed || scope.full || scope.app.resolveAll;
            const resolve = (row: CraftRow): ResolvedBounty | undefined => resolveCraftBounty(
                row.entityId, row.subject, row.ownerEntityId, row.claimEntityId,
                state.playerAccounts, snapshot.claimOwners, state.bountyRules, state.overrides,
            ) ?? undefined;

            let stop = startStep("assign_resolve_loop");
            const changed = new Set<bigint>();
            const candidates = new Set<bigint>();
            if (everything) {
                const previous = resolved;
                resolved = new Map();
                for (const row of rows) {
                    const bounty = resolve(row);
                    if (bounty) resolved.set(row.entityId, bounty);
                }
                for (const [craftId, bounty] of resolved) {
                    const before = previous.get(craftId);
                    if (!before || !sameBounty(before, bounty)) changed.add(craftId);
                    candidates.add(craftId);
                }
                for (const craftId of previous.keys()) if (!resolved.has(craftId)) changed.add(craftId);
                for (const craftId of state.assignments.keys()) candidates.add(craftId);
                primed = true;
            } else {
                const touched = new Set<bigint>();
                const before = new Map<bigint, ResolvedBounty | undefined>();
                const update = (craftId: bigint, bounty: ResolvedBounty | undefined) => {
                    touched.add(craftId);
                    if (!before.has(craftId)) before.set(craftId, resolved.get(craftId));
                    if (bounty) resolved.set(craftId, bounty);
                    else resolved.delete(craftId);
                };
                for (const row of scope.changed) update(row.entityId, resolve(row));
                for (const craftId of scope.app.overrideCrafts) {
                    const row = scope.rowOf(craftId);
                    update(craftId, row ? resolve(row) : undefined);
                }
                for (const craftId of scope.removed) update(craftId, undefined);
                for (const [craftId, previous] of before) {
                    const bounty = resolved.get(craftId);
                    if (!!previous !== !!bounty || (previous && bounty && !sameBounty(previous, bounty))) changed.add(craftId);
                }
                for (const craftId of touched) candidates.add(craftId);
                for (const craftId of scope.deleted) candidates.add(craftId);
                for (const craftId of scope.app.assignmentCrafts) candidates.add(craftId);
                for (const craftId of retryAssign) candidates.add(craftId);
            }
            retryAssign.clear();
            for (const craftId of changed) unpriced.add(craftId);
            stop();

            stop = startStep("assign_write_loop");
            for (const craftId of candidates) {
                const bounty = resolved.get(craftId);
                const previous = state.assignments.get(craftId);
                if (bounty) {
                    const unchanged = previous !== undefined
                        && previous.ratioNumerator === bounty.ratioNumerator
                        && previous.ratioDenominator === bounty.ratioDenominator
                        && previous.currency === bounty.currency
                        && previous.assignedByAccountIdentity.isEqual(bounty.assignedByAccountIdentity)
                        && previous.private === bounty.private;
                    if (unchanged) continue;

                    const row = scope.rowOf(craftId);
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
                        retryAssign.add(craftId);
                        scoped.error("assign_craft_bounty failed", {craftId: craftId.toString(), error: cause instanceof Error ? cause.message : String(cause)});
                    });
                } else if (previous) {
                    // A stored assignment with no resolved bounty is cleared if its craft is open (the
                    // bounty went away) or gone from `craft_meta` entirely (past the 24-hour
                    // Claimed/Removed tail — see `isOpen` in prism.ts); one on a closed craft still in
                    // that tail is left alone.
                    if (!scope.rowOf(craftId) && snapshot.allCraftIds.has(craftId)) continue;
                    timeReducerCall("clear_craft_bounty", conn.reducers.clearCraftBounty({craftId})).catch(cause => {
                        retryAssign.add(craftId);
                        scoped.error("clear_craft_bounty failed", {craftId: craftId.toString(), error: cause instanceof Error ? cause.message : String(cause)});
                    });
                }
            }
            stop();

            return {bounties: resolved, changed};
        },

        updateEntitlements(snapshot, scope) {
            const conn = liveConnection();
            if (!conn) return;

            const state = cache.state;
            const full = needFullPricing || scope.full;
            needFullPricing = false;
            writtenBonus.clear();

            let crafts: Iterable<bigint>;
            if (full) {
                crafts = [...resolved.keys()];
            } else {
                crafts = new Set([...scope.contributionCrafts, ...unpriced, ...retryEntitlement]);
            }
            unpriced = new Set();
            retryEntitlement.clear();

            const stop = startStep("ent_loop");
            for (const craftId of crafts) {
                const bounty = resolved.get(craftId);
                const byPlayer = snapshot.contributions.get(craftId);
                if (!bounty || !byPlayer) continue;
                for (const [playerId, effort] of byPlayer) {
                    // The module owns the actual conversion math (new effort at *this* ratio, plus
                    // whatever it's carrying in `remainderEffort`) — this call only ever hands over
                    // current facts (cumulative effort, current ratio), never a precomputed total, so
                    // a rate change here only prices effort from here on, never revalues the past. See
                    // `upsertCraftBountyEntitlement`'s doc comment.
                    const previous = state.entitlements.get(`${craftId}:${playerId}:${bounty.currency}`);
                    if (previous && previous.lastAssignedEffort === effort) continue;

                    // Every bonus (manual assignment + every currently-satisfied automated rule)
                    // folds into the bounty ratio *before* the floor the module applies to new
                    // effort, keeping this a single floor operation per conversion. This makes
                    // `craft_bounty_entitlement`/`bounty_entitlement_total` the loyalty-adjusted
                    // ("actual") ledger; the frontend's estimated-payout preview never sees a
                    // multiplier and keeps using the raw assigned ratio.
                    const payer = bounty.assignedByAccountIdentity;
                    const loyalty = state.loyaltyRewards.get(tripleKey(payer, playerId, bounty.currency));
                    const manualBonus = loyalty ? bonusFromMultiplier(loyalty.ratioNumerator, loyalty.ratioDenominator) : {numerator: 0n, denominator: 1n};
                    const automaticBonus = resolveAutomaticBonus(
                        state.loyaltyRules.get(payer.toHexString()) ?? [],
                        snapshot.claimMembers, state.entitlementTotals, payer, playerId, bounty.currency, state.totalKeysByPayee,
                    );
                    const totalBonus = addRatio(manualBonus, automaticBonus);
                    let effectiveRatio = {numerator: bounty.ratioNumerator, denominator: bounty.ratioDenominator};
                    if (totalBonus.numerator !== 0n) {
                        effectiveRatio = reduceRatio(
                            bounty.ratioNumerator * (totalBonus.numerator + totalBonus.denominator),
                            bounty.ratioDenominator * totalBonus.denominator,
                        );
                    }
                    writeBonus(conn, {payer, payee: playerId, currency: bounty.currency}, automaticBonus);

                    timeReducerCall("upsert_craft_bounty_entitlement", conn.reducers.upsertCraftBountyEntitlement({
                        craftId,
                        playerId,
                        currency: bounty.currency,
                        effort,
                        ratioNumerator: effectiveRatio.numerator,
                        ratioDenominator: effectiveRatio.denominator,
                        updatedAt: Timestamp.now(),
                    })).catch(cause => {
                        retryEntitlement.add(craftId);
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

        updateLoyaltyBonuses(snapshot, scope) {
            const conn = liveConnection();
            if (!conn) return;

            const state = cache.state;
            const full = needFullLoyalty || scope.full;
            needFullLoyalty = false;

            const stop = startStep("loyalty_loop");
            const triples = new Map<string, Triple>();
            const addKnown = (key: string) => {
                const total = state.entitlementTotals.get(key);
                if (total) triples.set(key, {payer: total.payerAccountIdentity, payee: total.payeePlayerId, currency: total.currency});
            };
            if (full) {
                for (const key of state.entitlementTotals.keys()) addKnown(key);
            } else {
                // An `allCurrencies` threshold sums the payee's totals across currencies, so a
                // change in one total can move the bonus of every currency of that payer and payee.
                for (const changed of scope.app.totals.values()) {
                    for (const key of state.totalKeysByPayee.get(changed.payee) ?? []) {
                        if (state.entitlementTotals.get(key)?.payerAccountIdentity.isEqual(changed.payer)) addKnown(key);
                    }
                }
                for (const playerId of scope.memberPlayers) for (const key of state.totalKeysByPayee.get(playerId) ?? []) addKnown(key);
                for (const payer of scope.app.loyaltyRulePayers) for (const key of state.totalKeysByPayer.get(payer) ?? []) addKnown(key);
            }
            for (const [key, triple] of retryBonus) triples.set(key, triple);
            retryBonus.clear();

            for (const triple of triples.values()) {
                const bonus = resolveAutomaticBonus(
                    state.loyaltyRules.get(triple.payer.toHexString()) ?? [],
                    snapshot.claimMembers, state.entitlementTotals, triple.payer, triple.payee, triple.currency, state.totalKeysByPayee,
                );
                writeBonus(conn, triple, bonus);
            }
            stop();
        },
    };
}
