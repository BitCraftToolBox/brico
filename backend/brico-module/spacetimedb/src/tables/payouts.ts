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
 * A payer-authored, payee-agnostic condition — unlike `loyalty_reward`, this names no payee at
 * all: `brico-bot` evaluates it against *whichever* contributor is currently being paid, and grants
 * `bonusRatioNumerator`/`bonusRatioDenominator` to anyone who currently satisfies it.
 *
 * Unlike `loyalty_reward.ratioNumerator`/`ratioDenominator` (a *multiplier*, >=1, e.g. `1.025`),
 * this is a **bonus-only fraction already** (e.g. `1/40` for +2.5%) — the same units
 * `bounty-sink.ts`'s `addRatio` sums several bonuses in, and the same units `loyalty_bonus_total`
 * below stores its resolved sum in. The frontend converts a user-typed multiplier (the UI still
 * shows/edits `1.025`, same as the manual reward's field) into this shape once, via
 * `bonusFromMultiplier`, before ever calling `upsertLoyaltyRule` — `brico-bot` must read this field
 * as-is, never re-apply `bonusFromMultiplier` to it, or it double-converts (e.g. a stored `1/40`
 * becoming `(1-40)/40 = -97.5%`).
 */
export const LoyaltyRuleSpec = t.enum('LoyaltyRuleSpec', {
    claimMembership: t.object('ClaimMembershipLoyaltyRule', {
        claimEntityId: t.u64(),
        /** One of `ClaimAccessFlag` (`@brico/crafts/filter`) — `"member"` is "a claim_member row exists, no flags set." */
        requiredAccess: t.string(),
    }),
    effortThreshold: t.object('EffortThresholdLoyaltyRule', {
        /** false = only this rule's own `currency`'s effort; true = summed across every currency this payer has bountied this payee in. */
        allCurrencies: t.bool(),
        threshold: t.i64(),
    }),
});

/**
 * A payer's automated loyalty rule. No uniqueness constraint (unlike `loyalty_reward`'s per-payee
 * triple): a payer can have any number of rules per currency — e.g. two effort-threshold tiers at
 * different thresholds, both able to fire for the same payee at once.
 */
export const loyalty_rule = table(
    {
        name: 'loyalty_rule',
        indexes: [{accessor: 'by_payer', algorithm: 'btree', columns: ['payerAccountIdentity']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        /** The bounty currency this rule's bonus applies to — independent of `effortThreshold`'s own currency scope. */
        currency: t.string(),
        spec: LoyaltyRuleSpec,
        bonusRatioNumerator: t.i64(),
        bonusRatioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * The resolved sum of every currently-satisfied `loyalty_rule` for one (payer, payee, currency) —
 * written only by `brico-bot`, never folding in the manual `loyalty_reward` (the frontend combines
 * the two for display). Row absence means "zero automated bonus right now": `brico-bot` deletes the
 * row rather than writing zero, mirroring `clearCraftBounty`'s "absence is the off state" convention.
 * Same shape/uniqueness convention as `bounty_entitlement_total` below (`by_payer_payee`, filtered to
 * `currency` in reducer code, not a database constraint).
 */
export const loyalty_bonus_total = table(
    {
        name: 'loyalty_bonus_total',
        indexes: [{accessor: 'by_payer_payee', algorithm: 'btree', columns: ['payerAccountIdentity', 'payeePlayerId']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        payeePlayerId: t.u64().index('btree'),
        currency: t.string(),
        bonusRatioNumerator: t.i64(),
        bonusRatioDenominator: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * Per-(craft, contributor, currency) earnings ledger. Unlike a full-history recompute, `entitledTotal`
 * only ever grows: each `upsertCraftBountyEntitlement` call converts *new* effort (since
 * `lastAssignedEffort`) at whatever ratio is in effect right now, adds that to `entitledTotal`, and
 * carries whatever didn't reach a whole currency unit forward in `remainderNumerator`/
 * `remainderDenominator` — so a bounty rate change only ever applies to effort accrued after the
 * change, never re-valuing effort already paid out under the old rate. This stays keyed per-craft
 * (unlike the two totals tables below) because the math is per-effort against that craft's own bounty
 * ratio. Both the craft and the per-craft effort have to be stored somewhere to run the delta
 * computation, but nothing else ever needs to see a bounty broken down by craft, only by
 * payer/payee/currency.
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
        /**
         * The fractional currency amount (< 1, exact — see `@brico/crafts/entitlement`'s `addRatio`)
         * left over after the last floor, carried into the next computation's sum rather than
         * dropped. Stored as an exact fraction, not an effort amount: a ratio's numerator need not be
         * 1, so "effort not yet worth a whole currency unit" doesn't correspond to a whole number of
         * effort units, only to a fractional currency amount.
         */
        remainderNumerator: t.i64().default(0n),
        remainderDenominator: t.i64().default(1n),
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

/**
 * The append-only transaction log behind `bounty_payout_record.paidTotal` — one row per
 * `recordBountyPayment` call, in whatever direction (positive or negative `amount`) it was
 * recorded. Rows are inserted, never edited or deleted: `bounty_payout_record.paidTotal` is (and
 * must remain) the running sum of every row here for that (payer, payee, currency) triple, but is
 * kept as its own table rather than recomputed from this log on every read, so aggregate reports
 * never have to scan a payer's full transaction history.
 */
export const bounty_payout_record_log = table(
    {
        name: 'bounty_payout_record_log',
        indexes: [{accessor: 'by_payer_payee', algorithm: 'btree', columns: ['payerAccountIdentity', 'payeePlayerId']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        // Same reasoning as `bounty_entitlement_total.payeePlayerId` above.
        payeePlayerId: t.u64().index('btree'),
        currency: t.string(),
        amount: t.i64(),
        createdAt: t.timestamp(),
    }
);
