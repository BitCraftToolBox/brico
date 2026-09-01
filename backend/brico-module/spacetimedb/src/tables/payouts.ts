import {t, table} from 'spacetimedb/server';

/**
 * A payer's payout multiplier for one payee player, per currency (manual loyalty rewards).
 */
export const loyalty_reward = table(
    {name: 'loyalty_reward'},
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity().index('btree'),
        payeePlayerId: t.u64(),
        currency: t.string(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * Per-(craft, contributor, currency) earnings ledger — a monotonic cumulative floor recomputed by
 * `brico-bot` via `@brico/crafts/entitlement`'s `computeEntitlement` whenever `craft_contribution`
 * changes for a craft that has an assignment. This stays keyed per-craft (unlike the two totals
 * tables below) because the math is per-effort against that craft's own bounty ratio. Both the
 * craft and the per-craft effort have to be stored somewhere to run the delta computation, but
 * nothing else ever needs to see a bounty broken down by craft, only by payer/payee/currency.
 */
export const craft_bounty_entitlement = table(
    {
        name: 'craft_bounty_entitlement',
        indexes: [
            {accessor: 'by_craft_player_currency', algorithm: 'btree', columns: ['craftId', 'playerId', 'currency']},
        ],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        craftId: t.u64(),
        playerId: t.u64(),
        currency: t.string(),
        /** Cumulative contribution as of the last computation. */
        lastAssignedEffort: t.i64(),
        entitledTotal: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * The sum of a payee's `craft_bounty_entitlement` across every craft a given payer has bountied
 * for them, per currency. Kept updated atomically by `upsertCraftBountyEntitlement` whenever it
 * records a per-craft delta, so this table is always the running sum, never recomputed. Same shape
 * as `bounty_payout_record` below on purpose — they're the "owed" and"paid" side of the same
 * payer/payee/currency relationship.
 */
export const bounty_entitlement_total = table(
    {
        name: 'bounty_entitlement_total',
        indexes: [
            // The write path (`addToEntitlementTotal`) and `myEntitlementsAsPayer` (payer known, any
            // payee) look up by (payer, payee) and scan the (few) matching currencies in JS; a third
            // index column for currency would be correct too, but isn't needed since uniqueness on
            // (payer, payee, currency) is enforced in reducer code, not by the database.
            {accessor: 'by_payer_payee', algorithm: 'btree', columns: ['payerAccountIdentity', 'payeePlayerId']},
        ],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        // Own index (not just a trailing column of `by_payer_payee`, which can't be prefix-scanned
        // from this side): `myEntitlementsAsContributor` looks up the caller's own (few) linked player
        // ids one at a time, any payer, and a view must not fall back to `.iter()` over the whole table
        // to get there.
        payeePlayerId: t.u64().index('btree'),
        currency: t.string(),
        total: t.i64(),
        totalEffort: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * A payer<->payee payment ledger, accumulated across every craft that payer has bountied for that
 * payee. Inserts to this table must be verified based on currency. Users must never be allowed
 * to insert trust-backed currencies themselves, only trust-less ones.
 */
export const bounty_payout_record = table(
    {
        name: 'bounty_payout_record',
        indexes: [{accessor: 'by_payer_payee', algorithm: 'btree', columns: ['payerAccountIdentity', 'payeePlayerId']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        // Same reasoning as `bounty_entitlement_total.payeePlayerId` above.
        payeePlayerId: t.u64().index('btree'),
        currency: t.string(),
        paidTotal: t.i64(),
        updatedAt: t.timestamp(),
    }
);
