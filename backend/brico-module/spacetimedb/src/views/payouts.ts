// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {entitlementsAsContributor, entitlementsAsPayer, payoutLogAsContributor, payoutLogAsPayer} from '../lib/payouts';
import {spacetimedb} from '../schema';
import {bounty_entitlement_total, bounty_payout_record, craft_bounty_entitlement, loyalty_bonus_total, loyalty_reward, loyalty_rule} from '../tables/payouts';

/** Unfiltered entitlement feed for brico-bot, which needs to read current entitlements back to compute deltas. */
export const allCraftBountyEntitlement = spacetimedb.view(
    {name: 'all_craft_bounty_entitlement', public: true},
    t.array(craft_bounty_entitlement.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_bounty_entitlement.where(_ => isTrusted);
    }
);

/** The caller's own loyalty-reward rows, as a payer. */
export const myLoyaltyReward = spacetimedb.view(
    {name: 'my_loyalty_reward', public: true},
    t.array(loyalty_reward.rowType),
    ctx => ctx.from.loyalty_reward.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** Unfiltered loyalty-reward feed for brico-bot, which needs every payer's rows to fold into entitlement computation. */
export const allLoyaltyReward = spacetimedb.view(
    {name: 'all_loyalty_reward', public: true},
    t.array(loyalty_reward.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.loyalty_reward.where(_ => isTrusted);
    }
);

/** The caller's own automated loyalty rules, as a payer. */
export const myLoyaltyRule = spacetimedb.view(
    {name: 'my_loyalty_rule', public: true},
    t.array(loyalty_rule.rowType),
    ctx => ctx.from.loyalty_rule.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** Unfiltered loyalty-rule feed for brico-bot, which needs every payer's rules to resolve automated bonuses. */
export const allLoyaltyRule = spacetimedb.view(
    {name: 'all_loyalty_rule', public: true},
    t.array(loyalty_rule.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.loyalty_rule.where(_ => isTrusted);
    }
);

/** The caller's own resolved automated-bonus totals, as a payer — for the loyalty page's read-only display. */
export const myLoyaltyBonusTotal = spacetimedb.view(
    {name: 'my_loyalty_bonus_total', public: true},
    t.array(loyalty_bonus_total.rowType),
    ctx => ctx.from.loyalty_bonus_total.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** Unfiltered resolved-bonus-total feed for brico-bot, which reads this back to diff against before writing. */
export const allLoyaltyBonusTotal = spacetimedb.view(
    {name: 'all_loyalty_bonus_total', public: true},
    t.array(loyalty_bonus_total.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.loyalty_bonus_total.where(_ => isTrusted);
    }
);

/**
 * Unfiltered `bounty_entitlement_total` feed for brico-bot — needed so it can read a payee's
 * existing total effort per (payer, payee, currency) to evaluate an `effortThreshold` loyalty rule.
 * `bounty_entitlement_total` otherwise has no service-principal view, only the two per-caller
 * procedural views (`myEntitlementsAsContributor`/`myEntitlementsAsPayer` below).
 */
export const allBountyEntitlementTotal = spacetimedb.view(
    {name: 'all_bounty_entitlement_total', public: true},
    t.array(bounty_entitlement_total.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.bounty_entitlement_total.where(_ => isTrusted);
    }
);

/** The caller's own payment ledger rows as a payer (see `recordBountyPayment`). */
export const myBountyPayoutRecordAsPayer = spacetimedb.view(
    {name: 'my_bounty_payout_record_as_payer', public: true},
    t.array(bounty_payout_record.rowType),
    ctx => ctx.from.bounty_payout_record.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/**
 * One row of the append-only `bounty_payout_record_log` (see its doc comment), `payerName`
 * resolved server-side same as `ContributorEntitlementRow`/`PayerEntitlementRow` below. Shared by
 * both directions — `myBountyPayoutRecordLogAsPayer` and `myBountyPayoutRecordLogAsContributor`
 * differ only in which underlying rows they return, never the shape.
 */
const BountyPayoutLogRow = t.row('BountyPayoutLogRow', {
    id: t.u64().primaryKey(),
    payerAccountIdentity: t.identity(),
    payerName: t.string(),
    payeePlayerId: t.u64(),
    currency: t.string(),
    amount: t.i64(),
    createdAt: t.timestamp(),
    source: t.string(),
    note: t.option(t.string()),
});

/** The caller's own transaction log as a payer — every row `recordBountyPayment` appended under
 * the caller's own identity, across every payee and currency. */
export const myBountyPayoutRecordLogAsPayer = spacetimedb.view(
    {name: 'my_bounty_payout_record_log_as_payer', public: true},
    t.array(BountyPayoutLogRow),
    ctx => payoutLogAsPayer(ctx.db, ctx.sender)
);

/** The caller's own transaction log as a contributor, across every BitCraft player id they've ever
 * linked — same player-id resolution as `myEntitlementsAsContributor` below. */
export const myBountyPayoutRecordLogAsContributor = spacetimedb.view(
    {name: 'my_bounty_payout_record_log_as_contributor', public: true},
    t.array(BountyPayoutLogRow),
    ctx => payoutLogAsContributor(ctx.db, ctx.sender)
);

/**
 * Output row for `myEntitlementsAsContributor`: one per (payer, currency) the caller has earned
 * from or been paid by, across any of their own linked BitCraft player ids. `payerName` is
 * resolved by the view itself (see `resolvePayerDisplayName` in `lib/payouts.ts`): never left for the
 * frontend to look up, since `linked_integration` is otherwise private to other accounts.
 */
const ContributorEntitlementRow = t.row('ContributorEntitlementRow', {
    id: t.string().primaryKey(),
    payerAccountIdentity: t.identity(),
    payerName: t.string(),
    payeePlayerId: t.u64(),
    currency: t.string(),
    effortTotal: t.i64(),
    earnedTotal: t.i64(),
    paidTotal: t.i64(),
});

/**
 * Output row for `myEntitlementsAsPayer`: one per (payee player id, currency) the caller has
 * bountied. `payeeAccountIdentity`/`payeeName` are only populated when the player id resolves to an
 * account that has itself set a display name (see `resolvePayeeAccount` in `lib/payouts.ts`). An account with no
 * display name is reported exactly as if the player id weren't linked at all.
 */
const PayerEntitlementRow = t.row('PayerEntitlementRow', {
    id: t.string().primaryKey(),
    payeePlayerId: t.u64(),
    payeeAccountIdentity: t.option(t.identity()),
    payeeName: t.option(t.string()),
    currency: t.string(),
    effortTotal: t.i64(),
    earnedTotal: t.i64(),
    /** The part of `earnedTotal` an escrow hold covers; 0 for a currency without escrow. The rest is unsecured loyalty uplift, so payees never see it. */
    guaranteedTotal: t.i64(),
    paidTotal: t.i64(),
});

/**
 * The caller's own entitlements as a contributor, across every BitCraft player id they've ever
 * linked (`bitcraft-ea2`, revoked included — past earnings on a since-unlinked character are still
 * theirs): one row per (payer, currency) they've earned from or been paid by, summed off the two
 * totals tables directly. Procedural, not a query view.
 */
export const myEntitlementsAsContributor = spacetimedb.view(
    {name: 'my_entitlements_as_contributor', public: true},
    t.array(ContributorEntitlementRow),
    ctx => entitlementsAsContributor(ctx.db, ctx.sender)
);

/**
 * The other direction of `myEntitlementsAsContributor`: every payee the caller has bountied
 * (`payerAccountIdentity == ctx.sender` on both totals tables), one row per (payee player id,
 * currency), with the payee's grouping account resolved per `resolvePayeeAccount` in `lib/payouts.ts`.
 */
export const myEntitlementsAsPayer = spacetimedb.view(
    {name: 'my_entitlements_as_payer', public: true},
    t.array(PayerEntitlementRow),
    ctx => entitlementsAsPayer(ctx.db, ctx.sender)
);
