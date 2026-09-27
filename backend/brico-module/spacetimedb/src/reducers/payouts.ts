// noinspection JSUnusedGlobalSymbols

import {addRatio, reduceRatio} from '@brico/crafts/entitlement';
import {CraftError} from '@brico/crafts/errors';
import {CLAIM_ACCESS_FLAGS} from '@brico/crafts/filter';
import type {Identity, Timestamp} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {validateBountyCurrency, validateManualBountyCurrency, validateRatio} from '../lib/bounty';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import type {Ctx} from '../schema';
import {spacetimedb} from '../schema';
import {LoyaltyRuleSpec} from '../tables/payouts';

/** The caller's own rows for one `(payeePlayerId, currency)` pair. `loyalty_reward` rows are
 * always looked up scoped to `ctx.sender` via `payerAccountIdentity`, so there is no cross-account row to
 * accidentally target and no separate "belongs to another account" check needed.
 */
function findOwnLoyaltyReward(ctx: Ctx, payeePlayerId: bigint, currency: string) {
    return [...ctx.db.loyalty_reward.payerAccountIdentity.filter(ctx.sender)]
        .find(row => row.payeePlayerId === payeePlayerId && row.currency === currency) ?? null;
}

/**
 * Create or edit the caller's own payout multiplier for one payee/currency.
 */
export const upsertLoyaltyReward = spacetimedb.reducer(
    {
        payeePlayerId: t.u64(),
        currency: t.string(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    },
    (ctx, {payeePlayerId, currency, ratioNumerator, ratioDenominator, updatedAt}) => {
        requireAccount(ctx);
        validateBountyCurrency(currency);
        validateRatio(ratioNumerator, ratioDenominator);
        // A loyalty reward is a *reward* — it must only ever boost a payout, never reduce it, so the
        // multiplier itself (ratioNumerator/ratioDenominator) must be at least 1.
        if (ratioNumerator < ratioDenominator) throw new SenderError(CraftError.LOYALTY_MULTIPLIER_TOO_SMALL);

        const existing = findOwnLoyaltyReward(ctx, payeePlayerId, currency);
        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.loyalty_reward.insert({
                id: 0n,
                payerAccountIdentity: ctx.sender,
                payeePlayerId,
                currency,
                ratioNumerator,
                ratioDenominator,
                updatedAt: clampedUpdatedAt,
            });
        } else {
            ctx.db.loyalty_reward.id.update({...existing, ratioNumerator, ratioDenominator, updatedAt: clampedUpdatedAt});
        }
    }
);

/** Hard deletes the caller's own loyalty reward for one payee/currency. */
export const deleteLoyaltyReward = spacetimedb.reducer(
    {payeePlayerId: t.u64(), currency: t.string()},
    (ctx, {payeePlayerId, currency}) => {
        requireAccount(ctx);
        const existing = findOwnLoyaltyReward(ctx, payeePlayerId, currency);
        if (existing === null) return;
        ctx.db.loyalty_reward.id.delete(existing.id);
    }
);

/**
 * Create or edit one of the caller's own automated loyalty rules. Unlike `loyalty_reward`, a rule
 * names no payee at all — `id: undefined` inserts a new row (autoInc); `id: Some(id)` edits that row
 * after an ownership check. Any number of rules per (payer, currency) is allowed — e.g. two
 * effort-threshold tiers at different thresholds.
 */
export const upsertLoyaltyRule = spacetimedb.reducer(
    {
        id: t.option(t.u64()),
        currency: t.string(),
        spec: LoyaltyRuleSpec,
        bonusRatioNumerator: t.i64(),
        bonusRatioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    },
    (ctx, {id, currency, spec, bonusRatioNumerator, bonusRatioDenominator, updatedAt}) => {
        requireAccount(ctx);
        validateBountyCurrency(currency);
        validateRatio(bonusRatioNumerator, bonusRatioDenominator);
        if (spec.tag === 'claimMembership') {
            if (!(CLAIM_ACCESS_FLAGS as readonly string[]).includes(spec.value.requiredAccess)) {
                throw new SenderError(`${CraftError.UNKNOWN_CLAIM_ACCESS_FLAG}:${spec.value.requiredAccess}`);
            }
        } else if (spec.value.threshold < 0n) {
            throw new SenderError(CraftError.EFFORT_THRESHOLD_MUST_NOT_BE_NEGATIVE);
        }

        if (id === undefined) {
            ctx.db.loyalty_rule.insert({
                id: 0n,
                payerAccountIdentity: ctx.sender,
                currency,
                spec,
                bonusRatioNumerator,
                bonusRatioDenominator,
                updatedAt,
            });
            return;
        }

        const existing = ctx.db.loyalty_rule.id.find(id);
        if (existing === null) throw new SenderError(CraftError.UNKNOWN_LOYALTY_RULE);
        if (!existing.payerAccountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.RULE_BELONGS_TO_ANOTHER_ACCOUNT);
        }
        ctx.db.loyalty_rule.id.update({...existing, currency, spec, bonusRatioNumerator, bonusRatioDenominator, updatedAt});
    }
);

/** Hard deletes one of the caller's own loyalty rules. No-op if already gone. */
export const deleteLoyaltyRule = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        requireAccount(ctx);
        const existing = ctx.db.loyalty_rule.id.find(id);
        if (existing === null) return;
        if (!existing.payerAccountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.RULE_BELONGS_TO_ANOTHER_ACCOUNT);
        }
        ctx.db.loyalty_rule.id.delete(id);
    }
);

/**
 * The caller's own rows for one `(payeePlayerId, currency)` pair, same lookup shape as
 * `findOwnLoyaltyReward`.
 */
function findLoyaltyBonusTotal(ctx: Ctx, payerAccountIdentity: Identity, payeePlayerId: bigint, currency: string) {
    return [...ctx.db.loyalty_bonus_total.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
        .find(row => row.currency === currency) ?? null;
}

/**
 * Service-principal-only: sets the absolute resolved sum of every currently-satisfied
 * `loyalty_rule` for one (payer, payee, currency) — `brico-bot` always recomputes the full current
 * bonus from scratch, never an incremental delta, same "set, don't fold" reasoning as
 * `importHistoricalBountyLedger`.
 */
export const upsertLoyaltyBonusTotal = spacetimedb.reducer(
    {
        payerAccountIdentity: t.identity(),
        payeePlayerId: t.u64(),
        currency: t.string(),
        bonusRatioNumerator: t.i64(),
        bonusRatioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    },
    (ctx, {payerAccountIdentity, payeePlayerId, currency, bonusRatioNumerator, bonusRatioDenominator, updatedAt}) => {
        requireServicePrincipal(ctx);
        validateBountyCurrency(currency);
        // A resolved bonus is a sum of non-negative rule bonuses (see `resolveAutomaticBonus`) and
        // must never itself be negative — validated here too, not just trusted from the bot, since a
        // bug in the bot's own math (as opposed to a malicious caller) is exactly the failure mode
        // this guards against.
        validateRatio(bonusRatioNumerator, bonusRatioDenominator);

        const existing = findLoyaltyBonusTotal(ctx, payerAccountIdentity, payeePlayerId, currency);
        if (existing === null) {
            ctx.db.loyalty_bonus_total.insert({
                id: 0n, payerAccountIdentity, payeePlayerId, currency, bonusRatioNumerator, bonusRatioDenominator, updatedAt,
            });
        } else {
            ctx.db.loyalty_bonus_total.id.update({...existing, bonusRatioNumerator, bonusRatioDenominator, updatedAt});
        }
    }
);

/** Service-principal-only: deletes a resolved bonus total once no rule matches any more. No-op if already gone. */
export const deleteLoyaltyBonusTotal = spacetimedb.reducer(
    {payerAccountIdentity: t.identity(), payeePlayerId: t.u64(), currency: t.string()},
    (ctx, {payerAccountIdentity, payeePlayerId, currency}) => {
        requireServicePrincipal(ctx);
        const existing = findLoyaltyBonusTotal(ctx, payerAccountIdentity, payeePlayerId, currency);
        if (existing === null) return;
        ctx.db.loyalty_bonus_total.id.delete(existing.id);
    }
);

/**
 * Folds `deltaFraction` (this call's new effort, priced at whatever ratio is in effect right now —
 * *not* yet floored) into the (payer, payee, currency) row of `bounty_entitlement_total`, inserting
 * a new row if none exists yet — the atomic "update the total" half of `upsertCraftBountyEntitlement`
 * below. Combines `deltaFraction` with whatever fraction this row is already carrying from a
 * *previous* call (from this craft or any other craft this payer has bountied this payee in),
 * floors once, grows `total` by that floored amount, and carries whatever's left of the combined
 * fraction forward — so a fractional remainder is pooled across every craft, not stranded in
 * whichever craft happened to produce it. Looked up via `by_payer_payee` and filtered to `currency`
 * in JS rather than a dedicated 3-column index, since uniqueness on the triple is enforced here,
 * not by the database (see the table's doc comment).
 */
function addToEntitlementTotal(
    ctx: Ctx,
    payerAccountIdentity: Identity,
    payeePlayerId: bigint,
    currency: string,
    deltaFraction: {numerator: bigint; denominator: bigint},
    deltaEffort: bigint,
    updatedAt: Timestamp,
): void {
    const existing = [...ctx.db.bounty_entitlement_total.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
        .find(row => row.currency === currency);
    const carriedRemainder = existing === undefined
        ? {numerator: 0n, denominator: 1n}
        : {numerator: existing.remainderNumerator, denominator: existing.remainderDenominator};

    const combined = addRatio(carriedRemainder, deltaFraction);
    const earned = combined.numerator / combined.denominator;
    const remainder = reduceRatio(combined.numerator - earned * combined.denominator, combined.denominator);

    if (existing === undefined) {
        ctx.db.bounty_entitlement_total.insert({
            id: 0n, payerAccountIdentity, payeePlayerId, currency,
            total: earned, totalEffort: deltaEffort,
            remainderNumerator: remainder.numerator, remainderDenominator: remainder.denominator,
            updatedAt,
        });
    } else {
        ctx.db.bounty_entitlement_total.id.update({
            ...existing, total: existing.total + earned, totalEffort: existing.totalEffort + deltaEffort,
            remainderNumerator: remainder.numerator, remainderDenominator: remainder.denominator,
            updatedAt,
        });
    }
}

/**
 * A craft's resolved bounty assignment, checking both the public and private assignment tables —
 * same "either one, whichever has the row" lookup `assignCraftBounty`/`clearCraftBounty` already do,
 * since a craft's assignment lives in exactly one of the two tables at a time.
 */
function findCraftBountyAssignment(ctx: Ctx, craftId: bigint) {
    return ctx.db.craft_bounty_assignment.craftId.find(craftId) ?? ctx.db.craft_private_bounty_assignment.craftId.find(craftId);
}

/**
 * Establishes a zero-earning baseline row for a (craft, contributor, currency) triple the moment
 * `brico-bot` sees that craft's bounty get assigned. This prevents whatever effort the contributor had
 * already accrued *before* the bounty existed from being retroactively paid out by
 * `upsertCraftBountyEntitlement`'s first call for that triple. Deliberately a no-op if a row already
 * exists — safe to call redundantly or late: once a real entitlement row exists, this must never reset
 * or overwrite it. This only ever covers a triple with *no* row at all; a triple whose bounty
 * was cleared and later reassigned already has a row, and is instead protected by
 * `upsertCraftBountyEntitlement`'s own gap detection.
 */
export const seedCraftBountyEntitlement = spacetimedb.reducer(
    {craftId: t.u64(), playerId: t.u64(), currency: t.string(), effort: t.i64(), updatedAt: t.timestamp()},
    (ctx, {craftId, playerId, currency, effort, updatedAt}) => {
        requireServicePrincipal(ctx);

        const assignment = findCraftBountyAssignment(ctx, craftId);
        if (assignment === null) throw new SenderError(CraftError.NO_BOUNTY_ASSIGNMENT);

        const existing = [...ctx.db.craft_bounty_entitlement.by_craft_player_currency.filter([craftId, playerId, currency])][0] ?? null;
        if (existing !== null) return;

        ctx.db.craft_bounty_entitlement.insert({
            id: 0n, craftId, playerId, currency, lastAssignedEffort: effort, updatedAt,
        });
    }
);

/**
 * Written by `brico-bot` whenever a (craft, contributor, currency) triple's cumulative effort or
 * effective ratio might have changed — i.e. whenever `craft_contribution` changes, or a loyalty
 * bonus resolves differently, for a craft that has a `craft_bounty_assignment`. `effort` is always
 * the contributor's current *cumulative* contribution (a fact straight from prism, independent of
 * this table's own state), and `ratioNumerator`/`ratioDenominator` is whatever ratio is in effect
 * right now. This reducer only computes the new effort since `lastAssignedEffort` and prices it at
 * that ratio as an *exact fraction* (`@brico/crafts/entitlement`'s `addRatio`/`reduceRatio` — never
 * effort units, since a ratio whose numerator isn't 1 has no whole-effort equivalent for a fractional
 * currency amount); the actual flooring and fractional carry happens in `addToEntitlementTotal`,
 * pooled across every craft this payer has bountied this payee in, not per-craft — see that
 * function's doc comment for why.
 *
 * A triple with no `existing` row is treated as a zero effort baseline and priced normally from
 * there — *not* seeded at zero and skipped, the way `seedCraftBountyEntitlement` handles a craft's
 * pre-existing contributors the moment its bounty is assigned. By the time this reducer is called
 * for a triple that really does have effort predating the bounty, `seedCraftBountyEntitlement` has
 * already given it a real (non-zero) baseline row, so this call sees `existing !== null` and prices
 * only the effort since that baseline. A triple that reaches here with no row at all is therefore a
 * contributor who started *after* the bounty already existed — their whole observed effort is fair
 * to price from zero, since there was no unprotected, bounty-free period for them to begin with.
 *
 * An `existing` row can itself predate a *gap*: a bounty can be cleared (its assignment row deleted)
 * and reassigned later while the contributor keeps working the craft in between. `assignedAt` is only
 * ever set on a true insert (see `assignCraftBounty`), so `assignment.assignedAt` newer than this
 * row's own `updatedAt` means the row hasn't been priced since *this* continuous assignment began —
 * there was a bounty-free gap since it was last touched. In that case the effort baseline jumps
 * straight to the current `effort` (so this call's delta is zero — the gap's effort is never priced).
 * A plain ratio/payer/currency edit on a bounty that was never cleared leaves `assignedAt` untouched
 * too, so it can never be mistaken for a gap.
 *
 * Also folds the delta into `bounty_entitlement_total`'s running (payer, payee, currency) sum, keyed
 * off the bounty's current `assignedByAccountIdentity` — so if a craft's bounty is ever reassigned to
 * a different payer mid-craft, effort already recorded under the old payer stays theirs, and only new
 * effort from here on accrues to whoever pays now. That craft must have an assignment, since the bot
 * only ever calls this for a craft that has one.
 */
export const upsertCraftBountyEntitlement = spacetimedb.reducer(
    {
        craftId: t.u64(),
        playerId: t.u64(),
        currency: t.string(),
        effort: t.i64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    },
    (ctx, {craftId, playerId, currency, effort, ratioNumerator, ratioDenominator, updatedAt}) => {
        requireServicePrincipal(ctx);
        validateRatio(ratioNumerator, ratioDenominator);

        const assignment = findCraftBountyAssignment(ctx, craftId);
        if (assignment === null) throw new SenderError(CraftError.NO_BOUNTY_ASSIGNMENT);

        const existing = [...ctx.db.craft_bounty_entitlement.by_craft_player_currency.filter([craftId, playerId, currency])][0] ?? null;
        // A gap: this row hasn't been priced since the *current* (continuous) assignment began, so
        // whatever effort accrued in between (while the bounty was actually cleared) must not be
        // priced — jump the effort baseline to now.
        const hasGap = existing !== null && assignment.assignedAt.microsSinceUnixEpoch > existing.updatedAt.microsSinceUnixEpoch;
        const lastAssignedEffort = existing === null || hasGap ? effort : existing.lastAssignedEffort;
        const deltaEffort = effort - lastAssignedEffort;

        if (existing === null) {
            ctx.db.craft_bounty_entitlement.insert({id: 0n, craftId, playerId, currency, lastAssignedEffort: effort, updatedAt});
        } else {
            ctx.db.craft_bounty_entitlement.id.update({...existing, lastAssignedEffort: effort, updatedAt});
        }

        if (deltaEffort !== 0n) {
            // The new effort's exact currency value at the ratio in effect *now* — not yet floored;
            // `addToEntitlementTotal` combines it with whatever fraction is still owed from any craft
            // and floors once, pooled.
            const deltaFraction = reduceRatio(deltaEffort * ratioNumerator, ratioDenominator);
            addToEntitlementTotal(ctx, assignment.assignedByAccountIdentity, playerId, currency, deltaFraction, deltaEffort, updatedAt);
        }
    }
);

/**
 * Adjusts the caller's own (`ctx.sender`, `payeePlayerId`, `currency`) running ledger by `delta`
 * (positive or negative). This is independent of any particular craft. The only validation is the
 * manual currency allow-list.
 */
export const recordBountyPayment = spacetimedb.reducer(
    {payeePlayerId: t.u64(), currency: t.string(), delta: t.i64()},
    (ctx, {payeePlayerId, currency, delta}) => {
        requireAccount(ctx);
        validateManualBountyCurrency(currency);
        const existing = [...ctx.db.bounty_payout_record.by_payer_payee.filter([ctx.sender, payeePlayerId])]
            .find(row => row.currency === currency);
        if (existing === undefined) {
            ctx.db.bounty_payout_record.insert({
                id: 0n,
                payerAccountIdentity: ctx.sender,
                payeePlayerId,
                currency,
                paidTotal: delta,
                updatedAt: ctx.timestamp,
            });
        } else {
            ctx.db.bounty_payout_record.id.update({
                ...existing,
                paidTotal: existing.paidTotal + delta,
                updatedAt: ctx.timestamp,
            });
        }
        ctx.db.bounty_payout_record_log.insert({
            id: 0n,
            payerAccountIdentity: ctx.sender,
            payeePlayerId,
            currency,
            amount: delta,
            createdAt: ctx.timestamp,
        });
    }
);

// ---------------------------------------------------------------------------
// Historical backfill — one-time import of pre-brico spreadsheet ledgers
// ---------------------------------------------------------------------------

const HistoricalBountyLedgerRow = t.object('HistoricalBountyLedgerRow', {
    payeePlayerId: t.u64(),
    currency: t.string(),
    totalEffort: t.i64(),
    total: t.i64(),
    paidTotal: t.i64(),
});

/**
 * Service-principal-only backfill of a payer's `bounty_entitlement_total` and `bounty_payout_record`
 * rows from a pre-brico spreadsheet ledger, one (payee, currency) row at a time. Unlike
 * `upsertCraftBountyEntitlement` and `recordBountyPayment` above, this *sets* the absolute totals
 * rather than folding in a delta. The importing script already has the spreadsheet's final
 * historical totals, not an increment to apply on top of an existing row. Calling this twice for the
 * same triple simply overwrites it with the given totals, which makes a partially failed import safe
 * to re-run.
 *
 * All of a payer's rows are taken in a single call — rather than one call per row — so the whole
 * import commits (or fails) as one transaction instead of leaving a partial ledger behind a
 * mid-import failure.
 */
export const importHistoricalBountyLedger = spacetimedb.reducer(
    {
        payerAccountIdentity: t.identity(),
        rows: t.array(HistoricalBountyLedgerRow),
    },
    (ctx, {payerAccountIdentity, rows}) => {
        requireServicePrincipal(ctx);

        for (const {payeePlayerId, currency, totalEffort, total, paidTotal} of rows) {
            validateManualBountyCurrency(currency);

            const existingEntitlement = [...ctx.db.bounty_entitlement_total.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
                .find(row => row.currency === currency);
            if (existingEntitlement === undefined) {
                ctx.db.bounty_entitlement_total.insert({
                    id: 0n, payerAccountIdentity, payeePlayerId, currency, total, totalEffort,
                    remainderNumerator: 0n, remainderDenominator: 1n, updatedAt: ctx.timestamp,
                });
            } else {
                ctx.db.bounty_entitlement_total.id.update({...existingEntitlement, total, totalEffort, updatedAt: ctx.timestamp});
            }

            const existingPayout = [...ctx.db.bounty_payout_record.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
                .find(row => row.currency === currency);
            if (existingPayout === undefined) {
                ctx.db.bounty_payout_record.insert({
                    id: 0n, payerAccountIdentity, payeePlayerId, currency, paidTotal, updatedAt: ctx.timestamp,
                });
            } else {
                ctx.db.bounty_payout_record.id.update({...existingPayout, paidTotal, updatedAt: ctx.timestamp});
            }
        }
    }
);
