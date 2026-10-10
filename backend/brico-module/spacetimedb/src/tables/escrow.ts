import {t, table} from 'spacetimedb/server';

// All tables here are private and written only by service-principal reducers (or by reducers acting
// on the caller's own wallet rows); see `views/escrow.ts` for what is exposed.

/**
 * One row per funded period of a craft's escrowed bounty; at most one open row (`closedAt` unset)
 * per craft, enforced in reducers. `fundingAccountId` is the Stelo account that paid for the hold, so
 * refunds still work after the wallet is unlinked on brico.
 *
 * `held − released ≥ ceil(accrued + ratio × (effortCovered − effortPriced))` while the craft is
 * assigned; `accrued` is the exact guaranteed value credited so far.
 */
export const craft_bounty_escrow = table(
    {name: 'craft_bounty_escrow'},
    {
        id: t.u64().primaryKey().autoInc(),
        craftId: t.u64().index('btree'),
        payerAccountIdentity: t.identity().index('btree'),
        currency: t.string(),
        fundingLinkId: t.u64(),
        fundingAccountId: t.u64(),
        /** Whole units pulled for this craft (including refund due re-reserved for a raise). */
        heldAmount: t.i64(),
        /** Cumulative units given up (rate cut, bounty removed, craft ended). */
        releasedAmount: t.i64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        effortCovered: t.i64(),
        effortPriced: t.i64(),
        accruedNumerator: t.i64(),
        accruedDenominator: t.i64(),
        heldAt: t.timestamp(),
        updatedAt: t.timestamp(),
        closedAt: t.option(t.timestamp()),
    }
);

/** Released money still physically in escrow, owed back to one paying wallet. One row per (payer, currency, paying wallet). */
export const bounty_escrow_wallet = table(
    {
        name: 'bounty_escrow_wallet',
        indexes: [{accessor: 'by_payer_currency', algorithm: 'btree', columns: ['payerAccountIdentity', 'currency']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        currency: t.string(),
        fundingAccountId: t.u64(),
        refundDue: t.i64(),
        updatedAt: t.timestamp(),
    }
);

/**
 * Fractional-carry pool for one (payer, payee, currency, paying wallet): `total = floor(F)` and
 * `guaranteedTotal = floor(G)`, each with its own `< 1` carry. `bounty_entitlement_total.total` is the
 * sum of its pools' `total`s.
 */
export const bounty_escrow_pool = table(
    {
        name: 'bounty_escrow_pool',
        indexes: [{accessor: 'by_payer_payee', algorithm: 'btree', columns: ['payerAccountIdentity', 'payeePlayerId']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity(),
        payeePlayerId: t.u64().index('btree'),
        currency: t.string(),
        fundingAccountId: t.u64(),
        total: t.i64(),
        remainderNumerator: t.i64(),
        remainderDenominator: t.i64(),
        guaranteedTotal: t.i64(),
        guaranteedRemainderNumerator: t.i64(),
        guaranteedRemainderDenominator: t.i64(),
        /** Paid out of escrow, or closed by an unclaimed rollover/refund. */
        paidEscrow: t.i64(),
        /** Loyalty extras paid out, which were pulled from the paying wallet into escrow first. */
        paidDirect: t.i64(),
        /** Loyalty extras pulled into escrow and not yet paid out; owed back to the paying wallet if they turn out not to be needed. */
        pulledExtras: t.i64(),
        /** First sweep that found money owed but no routable payout wallet; cleared by a successful payout. */
        unclaimedSince: t.option(t.timestamp()),
        updatedAt: t.timestamp(),
    }
);

/** Append-only ledger of physical movement into and out of escrow (`amount` is signed: + in, − out). */
export const bounty_escrow_journal = table(
    {name: 'bounty_escrow_journal'},
    {
        id: t.u64().primaryKey().autoInc(),
        payerAccountIdentity: t.identity().index('btree'),
        currency: t.string(),
        /** One of `JOURNAL_KINDS` in `lib/escrow.ts`. */
        kind: t.string(),
        amount: t.i64(),
        fundingAccountId: t.u64(),
        craftId: t.option(t.u64()),
        payeePlayerId: t.option(t.u64()),
        transferId: t.u64(),
        createdAt: t.timestamp(),
    }
);

export const SteloTransferState = t.enum('SteloTransferState', {
    pending: t.unit(),
    settled: t.unit(),
    failed: t.unit(),
});

/** What a Stelo transfer is for. Purpose-specific parameters live in the variant payload. */
export const SteloTransferPurpose = t.enum('SteloTransferPurpose', {
    hold: t.object('SteloHold', {
        craftId: t.u64(),
        fundingLinkId: t.u64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        effortCovered: t.i64(),
    }),
    topUp: t.object('SteloTopUp', {
        craftId: t.u64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        /** Units of the craft's wallet's refund due re-reserved by this raise instead of pulled. */
        reserved: t.i64(),
    }),
    /** Escrow wallet to the payee's receiving wallet; `extras` of its amount are pulled loyalty extras, the rest guaranteed. */
    payout: t.object('SteloPayout', {
        payeePlayerId: t.u64(),
        fundingAccountId: t.u64(),
        extras: t.i64(),
    }),
    refund: t.object('SteloRefund', {
        fundingAccountId: t.u64(),
    }),
    /** Paying wallet to escrow wallet: a pool's loyalty extras, pulled so one payout can carry them. */
    extras: t.object('SteloExtras', {
        payeePlayerId: t.u64(),
        fundingAccountId: t.u64(),
    }),
});

/**
 * Write-ahead record of one Stelo transfer. `ref` (`<prefix><id>`, ≤ 32 bytes) is both the Stelo memo
 * and idempotency key, so replaying the send can't duplicate it.
 */
export const stelo_transfer = table(
    {name: 'stelo_transfer'},
    {
        id: t.u64().primaryKey().autoInc(),
        ref: t.string().unique(),
        currency: t.string(),
        payerAccountIdentity: t.identity().index('btree'),
        fromAccountId: t.u64(),
        toAccountId: t.u64(),
        /** Whole brico units. */
        amount: t.i64(),
        /** Raw Stelo units (`amount × 10^ledger.scale`), frozen at intent time. */
        steloAmount: t.u64(),
        purpose: SteloTransferPurpose,
        state: SteloTransferState,
        steloTransferId: t.option(t.u64()),
        failureReason: t.option(t.string()),
        createdAt: t.timestamp(),
        settledAt: t.option(t.timestamp()),
    }
);

/** Singleton (`id = 0`): when the interval payout sweep last ran, and how often it runs. */
export const stelo_payout_schedule = table(
    {name: 'stelo_payout_schedule', public: true},
    {
        id: t.u8().primaryKey(),
        intervalMicros: t.i64(),
        lastSweepAt: t.timestamp(),
    }
);

/**
 * What happens to a payee's escrow-backed money when they have no routable wallet, per escrowed currency.
 * Published from `brico-bot`'s configuration so the UI can state it; the bot applies it, not the module.
 */
export const stelo_currency_policy = table(
    {name: 'stelo_currency_policy', public: true},
    {
        currency: t.string().primaryKey(),
        /** 'rollover' | 'refund'. */
        action: t.string(),
        /** The manually recorded currency credited to the payee on a rollover. */
        rollTo: t.option(t.string()),
        /** Days after a payee is first found unroutable before the money is closed out. */
        afterDays: t.u32(),
    }
);

/** One row per active `stelo` link: the escrow currency whose ledger the wallet is on (written by `brico-bot` once it verifies the link). */
export const stelo_wallet = table(
    {name: 'stelo_wallet'},
    {
        linkId: t.u64().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        currency: t.string(),
    }
);

/** The wallet an account designates to receive payouts and refunds in one currency; one per (account, currency), enforced in reducers. */
export const stelo_receiving_wallet = table(
    {
        name: 'stelo_receiving_wallet',
        indexes: [{accessor: 'by_account_currency', algorithm: 'btree', columns: ['accountIdentity', 'currency']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        accountIdentity: t.identity(),
        currency: t.string(),
        linkId: t.u64(),
    }
);

/**
 * Why a craft's escrowed bounty is or isn't funded, one row per craft whose resolved bounty is in an
 * escrowed currency; written by `brico-bot` only when the row would change. Private to the payer.
 * `state` / `source` / `reason` are validated against the `@brico/crafts/stelo` allow-lists.
 */
export const craft_bounty_funding = table(
    {name: 'craft_bounty_funding'},
    {
        craftId: t.u64().primaryKey(),
        payerAccountIdentity: t.identity().index('btree'),
        /** 'override' | 'rule'. */
        source: t.string(),
        /** `bounty_rule.id` when `source` is 'rule'. */
        ruleId: t.option(t.string()),
        currency: t.string(),
        fundingLinkId: t.option(t.u64()),
        /** The resolved rate, which differs from the assignment while a raise is pending. */
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        /** 'waiting' | 'funding' | 'failed' | 'funded'. */
        state: t.string(),
        /** A machine code, never display text. */
        reason: t.option(t.string()),
        /** `stelo_transfer.id` of the in-flight or last failed hold/top-up. */
        transferId: t.option(t.u64()),
        updatedAt: t.timestamp(),
    }
);

/**
 * What `brico-bot` last saw of a wallet link, written by the bot when it changes: whether it can pull
 * from the wallet (`canPull`) and whether the linker is still an Admin or Owner member of it
 * (`verified`). Only a verified wallet may fund bounties; the bot re-checks both live before every pull.
 */
export const stelo_wallet_status = table(
    {name: 'stelo_wallet_status'},
    {
        linkId: t.u64().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        canPull: t.bool(),
        verified: t.bool(),
        updatedAt: t.timestamp(),
    }
);
