// noinspection JSUnusedGlobalSymbols

import type {Identity, Timestamp} from 'spacetimedb';
import {t} from 'spacetimedb/server';
import type {VCtx} from '../schema';
import {spacetimedb} from '../schema';
import {bounty_payout_record, craft_bounty_entitlement, loyalty_reward} from '../tables/payouts';

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

/** The caller's own payment ledger rows as a payer (see `recordBountyPayment`). */
export const myBountyPayoutRecordAsPayer = spacetimedb.view(
    {name: 'my_bounty_payout_record_as_payer', public: true},
    t.array(bounty_payout_record.rowType),
    ctx => ctx.from.bounty_payout_record.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/**
 * Resolves a payer account's display name for the report views below: its own `displayName` if
 * set; otherwise its oldest still-active `bitcraft-ea2` link's handle (preferring the longest-
 * standing proof of who they are over a more recent one); otherwise its most-recently-revoked
 * one's handle (a payer must have linked a BitCraft account at some point to have assigned a
 * bounty — unlinking doesn't let them out of an existing payer relationship); otherwise, for a
 * genuinely broken row (no handle recorded on the chosen link either), the identity itself.
 */
function resolvePayerDisplayName(ctx: VCtx, payerAccountIdentity: Identity): string {
    const account = ctx.db.account.identity.find(payerAccountIdentity);
    if (account?.displayName) return account.displayName;

    let oldestActive: { linkedAt: Timestamp; externalHandle?: string } | null = null;
    let mostRecentRevoked: { revokedAt: Timestamp; externalHandle?: string } | null = null;
    for (const link of ctx.db.linked_integration.accountIdentity.filter(payerAccountIdentity)) {
        if (link.provider !== 'bitcraft-ea2') continue;
        if (link.revokedAt === undefined) {
            if (oldestActive === null || link.linkedAt.microsSinceUnixEpoch < oldestActive.linkedAt.microsSinceUnixEpoch) {
                oldestActive = link;
            }
        } else if (mostRecentRevoked === null || link.revokedAt.microsSinceUnixEpoch > mostRecentRevoked.revokedAt.microsSinceUnixEpoch) {
            mostRecentRevoked = {revokedAt: link.revokedAt, externalHandle: link.externalHandle};
        }
    }
    return (oldestActive ?? mostRecentRevoked)?.externalHandle ?? payerAccountIdentity.toHexString();
}

/**
 * Resolves the brico account a payee player id should be grouped under for the manager-side
 * report, or `null` if it shouldn't be grouped at all. Only an *active* `bitcraft-ea2` link
 * counts, and only when that account has itself set a `displayName`: an unnamed account is
 * reported exactly as if the player id weren't linked.
 */
function resolvePayeeAccount(ctx: VCtx, payeePlayerId: bigint): { identity: Identity; displayName: string } | null {
    for (const link of ctx.db.linked_integration.by_provider_external_id.filter(['bitcraft-ea2', payeePlayerId.toString()])) {
        if (link.revokedAt !== undefined) continue;
        const account = ctx.db.account.identity.find(link.accountIdentity);
        return account?.displayName ? {identity: account.identity, displayName: account.displayName} : null;
    }
    return null;
}

/**
 * Output row for `myEntitlementsAsContributor`: one per (payer, currency) the caller has earned
 * from or been paid by, across any of their own linked BitCraft player ids. `payerName` is
 * resolved by the view itself (see `resolvePayerDisplayName`): never left for the frontend to look up,
 * since `linked_integration` is otherwise private to other accounts.
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
 * account that has itself set a display name (see `resolvePayeeAccount`). An account with no
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
    ctx => {
        const playerIds = new Set<bigint>();
        for (const link of ctx.db.linked_integration.accountIdentity.filter(ctx.sender)) {
            if (link.provider === 'bitcraft-ea2') playerIds.add(BigInt(link.externalId));
        }
        if (playerIds.size === 0) return [];

        const keyOf = (payer: Identity, playerId: bigint, currency: string) => `${payer.toHexString()}:${playerId}:${currency}`;
        const rows = new Map<string, { payerAccountIdentity: Identity; payeePlayerId: bigint; currency: string; effortTotal: bigint; earnedTotal: bigint; paidTotal: bigint }>();

        // `playerIds` is small in practice (a handful of linked characters at most), so a per-id
        // indexed lookup here beats a full scan of either totals table — a view must never fall back
        // to `.iter()` over a whole table when the caller only cares about a known, bounded id set.
        for (const playerId of playerIds) {
            for (const total of ctx.db.bounty_entitlement_total.payeePlayerId.filter(playerId)) {
                rows.set(keyOf(total.payerAccountIdentity, total.payeePlayerId, total.currency), {
                    payerAccountIdentity: total.payerAccountIdentity,
                    payeePlayerId: total.payeePlayerId,
                    currency: total.currency,
                    effortTotal: total.totalEffort,
                    earnedTotal: total.total,
                    paidTotal: 0n,
                });
            }
        }
        for (const playerId of playerIds) {
            for (const paid of ctx.db.bounty_payout_record.payeePlayerId.filter(playerId)) {
                const key = keyOf(paid.payerAccountIdentity, paid.payeePlayerId, paid.currency);
                const row = rows.get(key);
                if (row) row.paidTotal = paid.paidTotal;
                else rows.set(key, {
                    payerAccountIdentity: paid.payerAccountIdentity,
                    payeePlayerId: paid.payeePlayerId,
                    currency: paid.currency,
                    effortTotal: 0n,
                    earnedTotal: 0n,
                    paidTotal: paid.paidTotal,
                });
            }
        }

        return [...rows.values()].map(row => ({
            id: keyOf(row.payerAccountIdentity, row.payeePlayerId, row.currency),
            payerAccountIdentity: row.payerAccountIdentity,
            payerName: resolvePayerDisplayName(ctx, row.payerAccountIdentity),
            payeePlayerId: row.payeePlayerId,
            currency: row.currency,
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            paidTotal: row.paidTotal,
        }));
    }
);

/**
 * The other direction of `myEntitlementsAsContributor`: every payee the caller has bountied
 * (`payerAccountIdentity == ctx.sender` on both totals tables), one row per (payee player id,
 * currency), with the payee's grouping account resolved per `resolvePayeeAccount`.
 */
export const myEntitlementsAsPayer = spacetimedb.view(
    {name: 'my_entitlements_as_payer', public: true},
    t.array(PayerEntitlementRow),
    ctx => {
        const keyOf = (playerId: bigint, currency: string) => `${playerId}:${currency}`;
        const rows = new Map<string, { payeePlayerId: bigint; currency: string; effortTotal: bigint; earnedTotal: bigint; paidTotal: bigint }>();

        for (const total of ctx.db.bounty_entitlement_total.by_payer_payee.filter(ctx.sender)) {
            rows.set(keyOf(total.payeePlayerId, total.currency), {
                payeePlayerId: total.payeePlayerId,
                currency: total.currency,
                effortTotal: total.totalEffort,
                earnedTotal: total.total,
                paidTotal: 0n,
            });
        }
        for (const paid of ctx.db.bounty_payout_record.by_payer_payee.filter(ctx.sender)) {
            const key = keyOf(paid.payeePlayerId, paid.currency);
            const row = rows.get(key);
            if (row) row.paidTotal = paid.paidTotal;
            else rows.set(key, {
                payeePlayerId: paid.payeePlayerId,
                currency: paid.currency,
                effortTotal: 0n,
                earnedTotal: 0n,
                paidTotal: paid.paidTotal,
            });
        }

        return [...rows.values()].map(row => {
            const account = resolvePayeeAccount(ctx, row.payeePlayerId);
            return {
                id: keyOf(row.payeePlayerId, row.currency),
                payeePlayerId: row.payeePlayerId,
                payeeAccountIdentity: account?.identity,
                payeeName: account?.displayName,
                currency: row.currency,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                paidTotal: row.paidTotal,
            };
        });
    }
);
