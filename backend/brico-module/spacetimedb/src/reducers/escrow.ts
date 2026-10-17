// noinspection JSUnusedGlobalSymbols

import {ceilRatio, escrowRequired, overlapRelease, reduceRatio, splitPayout} from '@brico/crafts/entitlement';
import {CraftError} from '@brico/crafts/errors';
import {FUNDING_REASONS, FUNDING_SOURCES, FUNDING_STATES, normalizeSteloNote} from '@brico/crafts/stelo';
import type {Identity} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {validateManualBountyCurrency, validateRatio} from '../lib/bounty';
import {
    addRefundDue,
    addSurfacedPayment,
    addSurfacedTotal,
    closeOpenEscrow,
    escrowAccrued,
    escrowRatio,
    findEscrowWallet,
    findOpenEscrow,
    findPool,
    journal,
    ratioAtLeast,
    releaseSurplusExtras,
    requireActiveSteloWallet,
    requireEscrowedCurrency,
    requireOwnSteloAccount,
    reservableRefundDue,
    routePayeeWallet,
} from '../lib/escrow';
import type {Ctx} from '../schema';
import {spacetimedb} from '../schema';
import {SteloTransferPurpose} from '../tables/escrow';

const REF_PREFIX_PATTERN = /^[a-z0-9]{1,8}$/i;

function invalidTransfer(reason: string): SenderError {
    return new SenderError(`${CraftError.INVALID_STELO_TRANSFER}:${reason}`);
}

/** The payer's transfers that haven't settled or failed yet. */
function pendingTransfers(ctx: Ctx, payer: Identity) {
    return [...ctx.db.stelo_transfer.payerAccountIdentity.filter(payer)].filter(row => row.state.tag === 'pending');
}

// ---------------------------------------------------------------------------
// Transfer intents
// ---------------------------------------------------------------------------

/**
 * Service-principal-only: writes the `Pending` row for a Stelo transfer *before* `brico-bot` attempts
 * it. Every argument is checked against the books regardless of what the bot sends; the row's `ref`
 * (`<refPrefix><id>`) is the idempotency key for the transfer and the start of its memo.
 */
export const recordSteloTransferIntent = spacetimedb.reducer(
    {
        refPrefix: t.string(),
        currency: t.string(),
        payerAccountIdentity: t.identity(),
        fromAccountId: t.u64(),
        toAccountId: t.u64(),
        amount: t.i64(),
        steloAmount: t.u64(),
        purpose: SteloTransferPurpose,
    },
    (ctx, {refPrefix, currency, payerAccountIdentity, fromAccountId, toAccountId, amount, steloAmount, purpose}) => {
        requireServicePrincipal(ctx);
        requireEscrowedCurrency(currency);
        if (!REF_PREFIX_PATTERN.test(refPrefix)) throw invalidTransfer('ref-prefix');
        if (amount <= 0n || steloAmount <= 0n) throw invalidTransfer('amount');
        if (ctx.db.account.identity.find(payerAccountIdentity) === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);

        const pending = pendingTransfers(ctx, payerAccountIdentity);

        switch (purpose.tag) {
            case 'hold': {
                const {craftId, fundingLinkId, ratioNumerator, ratioDenominator, effortCovered} = purpose.value;
                validateRatio(ratioNumerator, ratioDenominator);
                if (effortCovered <= 0n) throw invalidTransfer('effort');
                if (findOpenEscrow(ctx, craftId) !== null
                    || pending.some(row => row.purpose.tag === 'hold' && row.purpose.value.craftId === craftId)) {
                    throw new SenderError(CraftError.ESCROW_ALREADY_FUNDED);
                }
                if (requireActiveSteloWallet(ctx, payerAccountIdentity, fundingLinkId, currency) !== fromAccountId) {
                    throw new SenderError(CraftError.INVALID_FUNDING_WALLET);
                }
                if (amount !== ceilRatio(reduceRatio(ratioNumerator * effortCovered, ratioDenominator))) throw invalidTransfer('hold-amount');
                break;
            }
            case 'topUp': {
                const {craftId, ratioNumerator, ratioDenominator, reserved} = purpose.value;
                validateRatio(ratioNumerator, ratioDenominator);
                const escrow = findOpenEscrow(ctx, craftId);
                if (escrow === null) throw new SenderError(CraftError.NO_OPEN_ESCROW);
                if (!escrow.payerAccountIdentity.isEqual(payerAccountIdentity) || escrow.currency !== currency) throw invalidTransfer('escrow-owner');
                const ratio = {numerator: ratioNumerator, denominator: ratioDenominator};
                if (ratioAtLeast(escrowRatio(escrow), ratio)) throw invalidTransfer('not-a-raise');
                if (pending.some(row => row.purpose.tag === 'topUp' && row.purpose.value.craftId === craftId)) throw invalidTransfer('top-up-pending');
                if (fromAccountId !== escrow.fundingAccountId) throw invalidTransfer('funding-wallet');
                const need = escrowRequired(escrowAccrued(escrow), ratio, escrow.effortCovered, escrow.effortPriced)
                    - (escrow.heldAmount - escrow.releasedAmount);
                const reservable = reservableRefundDue(ctx, payerAccountIdentity, currency, escrow.fundingAccountId);
                if (need <= 0n || reserved < 0n || reserved > reservable || reserved > need || amount !== need - reserved) {
                    throw invalidTransfer('top-up-amount');
                }
                break;
            }
            case 'payout': {
                const {payeePlayerId, fundingAccountId, extras} = purpose.value;
                const pool = findPool(ctx, payerAccountIdentity, payeePlayerId, currency, fundingAccountId);
                if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
                if (pending.some(row => row.purpose.tag === 'payout'
                    && row.purpose.value.payeePlayerId === payeePlayerId
                    && row.purpose.value.fundingAccountId === fundingAccountId)) {
                    throw new SenderError(CraftError.PAYOUT_ALREADY_PENDING);
                }
                const split = splitPayout(pool);
                if (extras < 0n || extras > pool.pulledExtras || extras > split.fromWallet || amount - extras > split.fromEscrow) {
                    throw invalidTransfer('payout-amount');
                }
                if (routePayeeWallet(ctx, payeePlayerId, currency) !== toAccountId) throw invalidTransfer('payee-wallet');
                break;
            }
            case 'extras': {
                const {payeePlayerId, fundingAccountId} = purpose.value;
                const pool = findPool(ctx, payerAccountIdentity, payeePlayerId, currency, fundingAccountId);
                if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
                if (pending.some(row => row.purpose.tag === 'extras'
                    && row.purpose.value.payeePlayerId === payeePlayerId
                    && row.purpose.value.fundingAccountId === fundingAccountId)) {
                    throw new SenderError(CraftError.PAYOUT_ALREADY_PENDING);
                }
                if (fromAccountId !== fundingAccountId) throw invalidTransfer('funding-wallet');
                if (amount + pool.pulledExtras > splitPayout(pool).fromWallet) throw invalidTransfer('extras-amount');
                if (routePayeeWallet(ctx, payeePlayerId, currency) === null) throw invalidTransfer('payee-wallet');
                break;
            }
            case 'refund': {
                const {fundingAccountId} = purpose.value;
                if (toAccountId !== fundingAccountId) throw invalidTransfer('refund-destination');
                if (amount > reservableRefundDue(ctx, payerAccountIdentity, currency, fundingAccountId)) {
                    throw invalidTransfer('refund-amount');
                }
                break;
            }
            case 'direct':
            case 'directNote': {
                if (purpose.tag === 'directNote' && normalizeSteloNote(purpose.value.note) !== purpose.value.note) throw invalidTransfer('note');
                if (fromAccountId === toAccountId) throw invalidTransfer('same-wallet');
                requireOwnSteloAccount(ctx, payerAccountIdentity, fromAccountId, currency);
                break;
            }
        }

        const row = ctx.db.stelo_transfer.insert({
            id: 0n,
            ref: `~${ctx.timestamp.microsSinceUnixEpoch}`,
            currency,
            payerAccountIdentity,
            fromAccountId,
            toAccountId,
            amount,
            steloAmount,
            purpose,
            state: {tag: 'pending'},
            steloTransferId: undefined,
            failureReason: undefined,
            createdAt: ctx.timestamp,
            settledAt: undefined,
        });
        ctx.db.stelo_transfer.id.update({...row, ref: `${refPrefix}${row.id}`});
    }
);

/** Service-principal-only: records that the Stelo transfer for intent `id` posted, and applies its effect on the books in the same transaction. Idempotent. */
export const settleSteloTransfer = spacetimedb.reducer(
    {id: t.u64(), steloTransferId: t.u64()},
    (ctx, {id, steloTransferId}) => {
        requireServicePrincipal(ctx);
        const transfer = ctx.db.stelo_transfer.id.find(id);
        if (transfer === null) throw new SenderError(CraftError.UNKNOWN_STELO_TRANSFER);
        if (transfer.state.tag === 'settled') return;
        if (transfer.state.tag === 'failed') throw invalidTransfer('already-failed');

        const {payerAccountIdentity: payer, currency, amount, purpose} = transfer;
        switch (purpose.tag) {
            case 'hold': {
                const {craftId, fundingLinkId, ratioNumerator, ratioDenominator, effortCovered} = purpose.value;
                if (findOpenEscrow(ctx, craftId) !== null) throw new SenderError(CraftError.ESCROW_ALREADY_FUNDED);
                ctx.db.craft_bounty_escrow.insert({
                    id: 0n, craftId, payerAccountIdentity: payer, currency, fundingLinkId, fundingAccountId: transfer.fromAccountId,
                    heldAmount: amount, releasedAmount: 0n, ratioNumerator, ratioDenominator,
                    effortCovered, effortPriced: 0n, accruedNumerator: 0n, accruedDenominator: 1n,
                    heldAt: ctx.timestamp, updatedAt: ctx.timestamp, closedAt: undefined,
                });
                journal(ctx, {payer, currency, kind: 'hold', amount, fundingAccountId: transfer.fromAccountId, craftId, transferId: id});
                break;
            }
            case 'topUp': {
                const {craftId, ratioNumerator, ratioDenominator, reserved} = purpose.value;
                const escrow = findOpenEscrow(ctx, craftId);
                if (escrow === null) {
                    // The craft's hold closed while the pull was in flight: the money is simply owed back.
                    addRefundDue(ctx, payer, currency, transfer.fromAccountId, amount);
                } else {
                    const wallet = findEscrowWallet(ctx, payer, currency, escrow.fundingAccountId);
                    if (reserved > 0n) {
                        if (wallet === null || wallet.refundDue < reserved) throw invalidTransfer('reserved-refund-due');
                        ctx.db.bounty_escrow_wallet.id.update({...wallet, refundDue: wallet.refundDue - reserved, updatedAt: ctx.timestamp});
                    }
                    ctx.db.craft_bounty_escrow.id.update({
                        ...escrow, heldAmount: escrow.heldAmount + amount + reserved, ratioNumerator, ratioDenominator, updatedAt: ctx.timestamp,
                    });
                }
                journal(ctx, {payer, currency, kind: 'topup', amount, fundingAccountId: transfer.fromAccountId, craftId, transferId: id});
                break;
            }
            case 'payout': {
                const {payeePlayerId, fundingAccountId, extras} = purpose.value;
                const pool = findPool(ctx, payer, payeePlayerId, currency, fundingAccountId);
                if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
                if (extras < 0n || extras > pool.pulledExtras) throw invalidTransfer('extras-exceed-pulled');
                const paid = {
                    ...pool,
                    paidEscrow: pool.paidEscrow + (amount - extras),
                    paidDirect: pool.paidDirect + extras,
                    pulledExtras: pool.pulledExtras - extras,
                    unclaimedSince: undefined,
                    updatedAt: ctx.timestamp,
                };
                ctx.db.bounty_escrow_pool.id.update(paid);
                releaseSurplusExtras(ctx, paid);
                journal(ctx, {payer, currency, kind: 'payout', amount: -amount, fundingAccountId, payeePlayerId, transferId: id});
                addSurfacedPayment(ctx, payer, payeePlayerId, currency, amount, 'transfer');
                break;
            }
            case 'extras': {
                const {payeePlayerId, fundingAccountId} = purpose.value;
                const pool = findPool(ctx, payer, payeePlayerId, currency, fundingAccountId);
                if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
                const pulled = {...pool, pulledExtras: pool.pulledExtras + amount, updatedAt: ctx.timestamp};
                ctx.db.bounty_escrow_pool.id.update(pulled);
                releaseSurplusExtras(ctx, pulled);
                journal(ctx, {payer, currency, kind: 'extras', amount, fundingAccountId, payeePlayerId, transferId: id});
                break;
            }
            case 'refund': {
                const {fundingAccountId} = purpose.value;
                const wallet = findEscrowWallet(ctx, payer, currency, fundingAccountId);
                if (wallet === null || wallet.refundDue < amount) throw invalidTransfer('refund-exceeds-due');
                ctx.db.bounty_escrow_wallet.id.update({...wallet, refundDue: wallet.refundDue - amount, updatedAt: ctx.timestamp});
                journal(ctx, {payer, currency, kind: 'refund', amount: -amount, fundingAccountId, transferId: id});
                break;
            }
            case 'direct':
            case 'directNote':
                break;
        }

        ctx.db.stelo_transfer.id.update({
            ...transfer, state: {tag: 'settled'}, steloTransferId, settledAt: ctx.timestamp,
        });
    }
);

/** Service-principal-only: terminal failure of a pending intent (no money moved, so the books are untouched). */
export const failSteloTransfer = spacetimedb.reducer(
    {id: t.u64(), reason: t.string()},
    (ctx, {id, reason}) => {
        requireServicePrincipal(ctx);
        const transfer = ctx.db.stelo_transfer.id.find(id);
        if (transfer === null) throw new SenderError(CraftError.UNKNOWN_STELO_TRANSFER);
        if (transfer.state.tag !== 'pending') return;
        ctx.db.stelo_transfer.id.update({
            ...transfer, state: {tag: 'failed'}, failureReason: reason.slice(0, 200), settledAt: ctx.timestamp,
        });
    }
);

// ---------------------------------------------------------------------------
// Escrow lifecycle
// ---------------------------------------------------------------------------

/**
 * Service-principal-only: the craft ended or its bounty was removed. Releases the unspent headroom
 * (owed back to the funding wallet) and closes the open hold; accrued entitlement stays in its pool.
 * No-op if the craft has no open hold.
 */
export const closeCraftEscrow = spacetimedb.reducer(
    {craftId: t.u64()},
    (ctx, {craftId}) => {
        requireServicePrincipal(ctx);
        closeOpenEscrow(ctx, craftId);
    }
);

/**
 * Service-principal-only: raises a craft's secured ratio using only refund due already sitting in
 * escrow for its funding wallet, with no transfer. Fails unless that fully covers the raise; a
 * partial cover goes through a `topUp` intent instead.
 */
export const raiseCraftEscrowFromRefundDue = spacetimedb.reducer(
    {craftId: t.u64(), ratioNumerator: t.i64(), ratioDenominator: t.i64()},
    (ctx, {craftId, ratioNumerator, ratioDenominator}) => {
        requireServicePrincipal(ctx);
        validateRatio(ratioNumerator, ratioDenominator);
        const escrow = findOpenEscrow(ctx, craftId);
        if (escrow === null) throw new SenderError(CraftError.NO_OPEN_ESCROW);
        const ratio = {numerator: ratioNumerator, denominator: ratioDenominator};
        if (ratioAtLeast(escrowRatio(escrow), ratio)) throw invalidTransfer('not-a-raise');

        const need = escrowRequired(escrowAccrued(escrow), ratio, escrow.effortCovered, escrow.effortPriced)
            - (escrow.heldAmount - escrow.releasedAmount);
        if (need > 0n) {
            const wallet = findEscrowWallet(ctx, escrow.payerAccountIdentity, escrow.currency, escrow.fundingAccountId);
            if (wallet === null || need > reservableRefundDue(ctx, escrow.payerAccountIdentity, escrow.currency, escrow.fundingAccountId)) {
                throw invalidTransfer('insufficient-refund-due');
            }
            ctx.db.bounty_escrow_wallet.id.update({...wallet, refundDue: wallet.refundDue - need, updatedAt: ctx.timestamp});
        }
        ctx.db.craft_bounty_escrow.id.update({
            ...escrow,
            heldAmount: escrow.heldAmount + (need > 0n ? need : 0n),
            ratioNumerator, ratioDenominator,
            updatedAt: ctx.timestamp,
        });
    }
);

// ---------------------------------------------------------------------------
// Pool maintenance
// ---------------------------------------------------------------------------

/**
 * Service-principal-only: reclassifies units paid directly that have since become guaranteed, so the
 * paying wallet gets them back from escrow. Recomputed here from the pool, never taken from the bot.
 * Covers every paying wallet's pool for (payer, payee, currency).
 */
export const releaseEscrowOverlap = spacetimedb.reducer(
    {payerAccountIdentity: t.identity(), payeePlayerId: t.u64(), currency: t.string()},
    (ctx, {payerAccountIdentity, payeePlayerId, currency}) => {
        requireServicePrincipal(ctx);
        const pools = [...ctx.db.bounty_escrow_pool.by_payer_payee.filter([payerAccountIdentity, payeePlayerId])]
            .filter(pool => pool.currency === currency);
        for (const pool of pools) {
            const r = overlapRelease(pool);
            if (r <= 0n) continue;
            const reclassified = {...pool, paidEscrow: pool.paidEscrow + r, paidDirect: pool.paidDirect - r, updatedAt: ctx.timestamp};
            ctx.db.bounty_escrow_pool.id.update(reclassified);
            addRefundDue(ctx, payerAccountIdentity, currency, pool.fundingAccountId, r);
            releaseSurplusExtras(ctx, reclassified);
        }
    }
);

/**
 * Service-principal-only: sets `unclaimedSince` on a pool that is owed money while its payee has no
 * routable wallet, and clears it once they do. Routability is recomputed here.
 */
export const syncEscrowPoolUnclaimed = spacetimedb.reducer(
    {payerAccountIdentity: t.identity(), payeePlayerId: t.u64(), currency: t.string(), fundingAccountId: t.u64()},
    (ctx, {payerAccountIdentity, payeePlayerId, currency, fundingAccountId}) => {
        requireServicePrincipal(ctx);
        const pool = findPool(ctx, payerAccountIdentity, payeePlayerId, currency, fundingAccountId);
        if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
        const unclaimed = splitPayout(pool).owed > 0n && routePayeeWallet(ctx, payeePlayerId, currency) === null;
        if (unclaimed && pool.unclaimedSince === undefined) {
            ctx.db.bounty_escrow_pool.id.update({...pool, unclaimedSince: ctx.timestamp});
        } else if (!unclaimed && pool.unclaimedSince !== undefined) {
            ctx.db.bounty_escrow_pool.id.update({...pool, unclaimedSince: undefined});
        }
    }
);

/**
 * Service-principal-only: closes out everything a pool still owes an unroutable payee. The
 * escrow-backed part and any loyalty extras already pulled into escrow go back to the paying wallet's
 * refund due; extras not yet pulled need no movement. `rollTo` credits the owed amount to the payee as that
 * (manually recorded) currency's entitlement; absent means refund only. The age policy
 * (`afterDays`) is `brico-bot` configuration, so only the unclaimed state is checked here.
 */
export const settleUnclaimedPayee = spacetimedb.reducer(
    {
        payerAccountIdentity: t.identity(),
        payeePlayerId: t.u64(),
        currency: t.string(),
        fundingAccountId: t.u64(),
        rollTo: t.option(t.string()),
    },
    (ctx, {payerAccountIdentity, payeePlayerId, currency, fundingAccountId, rollTo}) => {
        requireServicePrincipal(ctx);
        if (rollTo !== undefined) validateManualBountyCurrency(rollTo);
        const pool = findPool(ctx, payerAccountIdentity, payeePlayerId, currency, fundingAccountId);
        if (pool === null) throw new SenderError(CraftError.UNKNOWN_ESCROW_POOL);
        if (pool.unclaimedSince === undefined || routePayeeWallet(ctx, payeePlayerId, currency) !== null) {
            throw new SenderError(CraftError.PAYEE_NOT_UNCLAIMED);
        }
        if (pendingTransfers(ctx, payerAccountIdentity).some(row => (row.purpose.tag === 'payout' || row.purpose.tag === 'extras')
            && row.purpose.value.payeePlayerId === payeePlayerId
            && row.purpose.value.fundingAccountId === fundingAccountId)) {
            throw new SenderError(CraftError.PAYOUT_ALREADY_PENDING);
        }
        const {owed, fromEscrow, fromWallet} = splitPayout(pool);
        if (owed <= 0n) throw new SenderError(CraftError.NOTHING_OWED);

        ctx.db.bounty_escrow_pool.id.update({
            ...pool,
            paidEscrow: pool.paidEscrow + fromEscrow,
            paidDirect: pool.paidDirect + fromWallet,
            pulledExtras: 0n,
            unclaimedSince: undefined,
            updatedAt: ctx.timestamp,
        });
        // Extras pulled into escrow but never paid out go back with the unspent guaranteed part.
        addRefundDue(ctx, payerAccountIdentity, currency, fundingAccountId, fromEscrow + pool.pulledExtras);
        addSurfacedPayment(ctx, payerAccountIdentity, payeePlayerId, currency, owed, rollTo === undefined ? 'forfeit' : 'rollover');
        if (rollTo !== undefined) addSurfacedTotal(ctx, payerAccountIdentity, payeePlayerId, rollTo, owed, 0n, ctx.timestamp);
    }
);

/** Service-principal-only: how often the payout sweep runs and when it last did (a singleton row, so restarts keep the cadence). */
export const setSteloPayoutSchedule = spacetimedb.reducer(
    {intervalMicros: t.i64(), lastSweepAt: t.timestamp()},
    (ctx, {intervalMicros, lastSweepAt}) => {
        requireServicePrincipal(ctx);
        if (intervalMicros <= 0n) throw invalidTransfer('interval');
        const row = {id: 0, intervalMicros, lastSweepAt};
        if (ctx.db.stelo_payout_schedule.id.find(0) === null) ctx.db.stelo_payout_schedule.insert(row);
        else ctx.db.stelo_payout_schedule.id.update(row);
    }
);

/**
 * Service-principal-only: publishes what the bot does with an escrowed currency's unclaimed money.
 * A rollover must name a manually recorded currency; a refund names none. No-op when unchanged.
 */
export const setSteloCurrencyPolicy = spacetimedb.reducer(
    {currency: t.string(), action: t.string(), rollTo: t.option(t.string()), afterDays: t.u32()},
    (ctx, {currency, action, rollTo, afterDays}) => {
        requireServicePrincipal(ctx);
        requireEscrowedCurrency(currency);
        if (action !== 'rollover' && action !== 'refund') throw invalidTransfer('policy-action');
        if (action === 'rollover') {
            if (rollTo === undefined) throw invalidTransfer('policy-roll-to');
            validateManualBountyCurrency(rollTo);
        } else if (rollTo !== undefined) {
            throw invalidTransfer('policy-roll-to');
        }
        const existing = ctx.db.stelo_currency_policy.currency.find(currency);
        if (existing === null) {
            ctx.db.stelo_currency_policy.insert({currency, action, rollTo, afterDays});
        } else if (existing.action !== action || existing.rollTo !== rollTo || existing.afterDays !== afterDays) {
            ctx.db.stelo_currency_policy.currency.update({currency, action, rollTo, afterDays});
        }
    }
);

// ---------------------------------------------------------------------------
// Stelo wallets
// ---------------------------------------------------------------------------

function requireActiveSteloLink(ctx: Ctx, linkId: bigint, accountIdentity?: Identity) {
    const link = ctx.db.linked_integration.id.find(linkId);
    if (link === null || link.provider !== 'stelo' || link.revokedAt !== undefined
        || (accountIdentity !== undefined && !link.accountIdentity.isEqual(accountIdentity))) {
        throw new SenderError(CraftError.NOT_AN_ACTIVE_STELO_LINK);
    }
    return link;
}

/**
 * Service-principal-only: records which escrow currency's ledger a freshly verified `stelo` link is
 * on. The account's first wallet on a currency also becomes its receiving wallet.
 */
export const registerSteloWallet = spacetimedb.reducer(
    {linkId: t.u64(), currency: t.string()},
    (ctx, {linkId, currency}) => {
        requireServicePrincipal(ctx);
        requireEscrowedCurrency(currency);
        const link = requireActiveSteloLink(ctx, linkId);
        const existing = ctx.db.stelo_wallet.linkId.find(linkId);
        if (existing === null) {
            ctx.db.stelo_wallet.insert({linkId, accountIdentity: link.accountIdentity, currency});
        } else {
            ctx.db.stelo_wallet.linkId.update({...existing, currency});
        }
        const hasReceiving = [...ctx.db.stelo_receiving_wallet.by_account_currency.filter([link.accountIdentity, currency])].length > 0;
        if (!hasReceiving) {
            ctx.db.stelo_receiving_wallet.insert({id: 0n, accountIdentity: link.accountIdentity, currency, linkId});
        }
    }
);

/** Designates one of the caller's own registered wallets as where payouts and refunds in `currency` go. */
export const setSteloReceivingWallet = spacetimedb.reducer(
    {currency: t.string(), linkId: t.u64()},
    (ctx, {currency, linkId}) => {
        requireAccount(ctx);
        requireEscrowedCurrency(currency);
        requireActiveSteloLink(ctx, linkId, ctx.sender);
        if (ctx.db.stelo_wallet.linkId.find(linkId)?.currency !== currency) throw new SenderError(CraftError.INVALID_FUNDING_WALLET);

        const existing = [...ctx.db.stelo_receiving_wallet.by_account_currency.filter([ctx.sender, currency])][0];
        if (existing === undefined) {
            ctx.db.stelo_receiving_wallet.insert({id: 0n, accountIdentity: ctx.sender, currency, linkId});
        } else {
            ctx.db.stelo_receiving_wallet.id.update({...existing, linkId});
        }
    }
);

/** Service-principal-only: records whether `brico-bot` can pull from a registered wallet and whether its linker is verified. Writes only when a value changes. */
export const setSteloWalletStatus = spacetimedb.reducer(
    {linkId: t.u64(), canPull: t.bool(), verified: t.bool()},
    (ctx, {linkId, canPull, verified}) => {
        requireServicePrincipal(ctx);
        const wallet = ctx.db.stelo_wallet.linkId.find(linkId);
        if (wallet === null) throw new SenderError(CraftError.NOT_AN_ACTIVE_STELO_LINK);
        const existing = ctx.db.stelo_wallet_status.linkId.find(linkId);
        if (existing === null) {
            ctx.db.stelo_wallet_status.insert({linkId, accountIdentity: wallet.accountIdentity, canPull, verified, updatedAt: ctx.timestamp});
        } else if (existing.canPull !== canPull || existing.verified !== verified) {
            ctx.db.stelo_wallet_status.linkId.update({...existing, canPull, verified, updatedAt: ctx.timestamp});
        }
    }
);

// ---------------------------------------------------------------------------
// Funding status
// ---------------------------------------------------------------------------

const FUNDING_STATE_SET: ReadonlySet<string> = new Set(FUNDING_STATES);
const FUNDING_SOURCE_SET: ReadonlySet<string> = new Set(FUNDING_SOURCES);
const FUNDING_REASON_SET: ReadonlySet<string> = new Set(FUNDING_REASONS);

function invalidFunding(field: string): SenderError {
    return new SenderError(`${CraftError.INVALID_FUNDING_STATUS}:${field}`);
}

/**
 * Service-principal-only: upserts why a craft's escrowed bounty is or isn't funded. A no-op when
 * nothing but `updatedAt` would change. `state`, `source` and `reason` are checked against the
 * `@brico/crafts/stelo` allow-lists.
 */
export const setCraftBountyFunding = spacetimedb.reducer(
    {
        craftId: t.u64(),
        payerAccountIdentity: t.identity(),
        source: t.string(),
        ruleId: t.option(t.string()),
        currency: t.string(),
        fundingLinkId: t.option(t.u64()),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        state: t.string(),
        reason: t.option(t.string()),
        transferId: t.option(t.u64()),
    },
    (ctx, args) => {
        requireServicePrincipal(ctx);
        requireEscrowedCurrency(args.currency);
        if (!FUNDING_STATE_SET.has(args.state)) throw invalidFunding('state');
        if (!FUNDING_SOURCE_SET.has(args.source)) throw invalidFunding('source');
        if (args.reason !== undefined && !FUNDING_REASON_SET.has(args.reason)) throw invalidFunding('reason');
        validateRatio(args.ratioNumerator, args.ratioDenominator);
        if (ctx.db.account.identity.find(args.payerAccountIdentity) === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);

        const {craftId} = args;
        const fields = {
            payerAccountIdentity: args.payerAccountIdentity,
            source: args.source,
            ruleId: args.ruleId,
            currency: args.currency,
            fundingLinkId: args.fundingLinkId,
            ratioNumerator: args.ratioNumerator,
            ratioDenominator: args.ratioDenominator,
            state: args.state,
            reason: args.reason,
            transferId: args.transferId,
        };
        const existing = ctx.db.craft_bounty_funding.craftId.find(craftId);
        if (existing === null) {
            ctx.db.craft_bounty_funding.insert({craftId, ...fields, updatedAt: ctx.timestamp});
            return;
        }
        const same = existing.payerAccountIdentity.isEqual(fields.payerAccountIdentity)
            && existing.source === fields.source && existing.ruleId === fields.ruleId && existing.currency === fields.currency
            && existing.fundingLinkId === fields.fundingLinkId && existing.ratioNumerator === fields.ratioNumerator
            && existing.ratioDenominator === fields.ratioDenominator && existing.state === fields.state
            && existing.reason === fields.reason && existing.transferId === fields.transferId;
        if (!same) ctx.db.craft_bounty_funding.craftId.update({craftId, ...fields, updatedAt: ctx.timestamp});
    }
);

/** Service-principal-only: drops a craft's funding row once it has no escrowed-currency intent any more. No-op if absent. */
export const clearCraftBountyFunding = spacetimedb.reducer(
    {craftId: t.u64()},
    (ctx, {craftId}) => {
        requireServicePrincipal(ctx);
        ctx.db.craft_bounty_funding.craftId.delete(craftId);
    }
);
