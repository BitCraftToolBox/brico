// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import type {Identity, Timestamp} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {validateBountyCurrency, validateManualBountyCurrency, validateRatio} from '../lib/bounty';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import type {Ctx} from '../schema';
import {spacetimedb} from '../schema';

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
 * Adds `delta` to the (payer, payee, currency) row of `bounty_entitlement_total`, inserting a new
 * row at `delta` if none exists yet — the atomic "update the total" half of
 * `upsertCraftBountyEntitlement` below. Looked up via `by_payer_payee` and filtered to `currency`
 * in JS rather than a dedicated 3-column index, since uniqueness on the triple is enforced here,
 * not by the database (see the table's doc comment).
 */
function addToEntitlementTotal(
    ctx: Ctx,
    payerAccountIdentity: Identity,
    payeePlayerId: bigint,
    currency: string,
    delta: bigint,
    deltaEffort: bigint,
    updatedAt: Timestamp,
): void {
    const existing = [...ctx.db.bounty_entitlement_total.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
        .find(row => row.currency === currency);
    if (existing === undefined) {
        ctx.db.bounty_entitlement_total.insert({id: 0n, payerAccountIdentity, payeePlayerId, currency, total: delta, totalEffort: deltaEffort, updatedAt});
    } else {
        ctx.db.bounty_entitlement_total.id.update({...existing, total: existing.total + delta, totalEffort: existing.totalEffort + deltaEffort, updatedAt});
    }
}

/**
 * Written by `brico-bot` whenever `computeEntitlement` produces a new cumulative total for a
 * (craft, contributor, currency) triple — i.e. whenever `craft_contribution` changes for a craft
 * that has a `craft_bounty_assignment`. Also folds the *delta* since that triple's last-recorded
 * `entitledTotal` into `bounty_entitlement_total`'s running (payer, payee, currency) sum, keyed off
 * the bounty's current `assignedByAccountIdentity` — so if a craft's bounty is ever reassigned to a
 * different payer mid-craft, effort already recorded under the old payer stays theirs, and only
 * new effort from here on accrues to whoever pays now. That craft must have an assignment, since
 * the bot only ever calls this for a craft that has one.
 */
export const upsertCraftBountyEntitlement = spacetimedb.reducer(
    {
        craftId: t.u64(),
        playerId: t.u64(),
        currency: t.string(),
        lastAssignedEffort: t.i64(),
        entitledTotal: t.i64(),
        updatedAt: t.timestamp(),
    },
    (ctx, {craftId, playerId, currency, lastAssignedEffort, entitledTotal, updatedAt}) => {
        requireServicePrincipal(ctx);

        const assignment = ctx.db.craft_bounty_assignment.craftId.find(craftId);
        if (assignment === null) throw new SenderError(CraftError.NO_BOUNTY_ASSIGNMENT);

        const existing = [...ctx.db.craft_bounty_entitlement.by_craft_player_currency.filter([craftId, playerId, currency])][0] ?? null;
        const deltaCurrency = entitledTotal - (existing?.entitledTotal ?? 0n);
        const deltaEffort = lastAssignedEffort - (existing?.lastAssignedEffort ?? 0n);

        if (existing === null) {
            ctx.db.craft_bounty_entitlement.insert({id: 0n, craftId, playerId, currency, lastAssignedEffort, entitledTotal, updatedAt});
        } else {
            ctx.db.craft_bounty_entitlement.id.update({...existing, lastAssignedEffort, entitledTotal, updatedAt});
        }

        if (deltaCurrency !== 0n || deltaEffort !== 0n) {
            addToEntitlementTotal(ctx, assignment.assignedByAccountIdentity, playerId, currency, deltaCurrency, deltaEffort, updatedAt);
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
    }
);
