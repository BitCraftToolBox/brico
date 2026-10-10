import {ceilRatio, escrowRequired, type Fraction, splitPayout} from '@brico/crafts/entitlement';
import {CraftError} from '@brico/crafts/errors';
import {ESCROWED_BOUNTY_CURRENCIES} from '@brico/crafts/filter';
import type {Identity, Timestamp} from 'spacetimedb';
import {SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';

export const JOURNAL_KINDS = ['hold', 'topup', 'extras', 'payout', 'refund'] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

const ESCROWED_CURRENCY_SET = new Set(ESCROWED_BOUNTY_CURRENCIES);

export function isEscrowedCurrency(currency: string): boolean {
    return ESCROWED_CURRENCY_SET.has(currency);
}

export function requireEscrowedCurrency(currency: string): void {
    if (!isEscrowedCurrency(currency)) throw new SenderError(`${CraftError.CURRENCY_NOT_ESCROWED}:${currency}`);
}

export type EscrowRow = NonNullable<ReturnType<Ctx['db']['craft_bounty_escrow']['id']['find']>>;
export type PoolRow = NonNullable<ReturnType<Ctx['db']['bounty_escrow_pool']['id']['find']>>;

/** `a ≥ b` for non-negative fractions. */
export function ratioAtLeast(a: Fraction, b: Fraction): boolean {
    return a.numerator * b.denominator >= b.numerator * a.denominator;
}

export function findOpenEscrow(ctx: Ctx, craftId: bigint): EscrowRow | null {
    for (const row of ctx.db.craft_bounty_escrow.craftId.filter(craftId)) {
        if (row.closedAt === undefined) return row;
    }
    return null;
}

export function escrowRatio(escrow: EscrowRow): Fraction {
    return {numerator: escrow.ratioNumerator, denominator: escrow.ratioDenominator};
}

export function escrowAccrued(escrow: EscrowRow): Fraction {
    return {numerator: escrow.accruedNumerator, denominator: escrow.accruedDenominator};
}

/** The Stelo account id behind an active `stelo` link, or null if the link isn't one. */
function steloAccountId(link: {externalId: string}): bigint | null {
    return /^\d{1,20}$/.test(link.externalId) ? BigInt(link.externalId) : null;
}

/**
 * The Stelo account id of one of `accountIdentity`'s active wallets on `currency` that may fund
 * bounties; throws `INVALID_FUNDING_WALLET` if the link is unknown, revoked, someone else's, not a
 * registered wallet or on another currency's ledger, and `FUNDING_WALLET_UNVERIFIED` if the bot has
 * not verified that the linker administers it.
 */
export function requireActiveSteloWallet(ctx: Ctx, accountIdentity: Identity, linkId: bigint, currency: string): bigint {
    const link = ctx.db.linked_integration.id.find(linkId);
    const wallet = ctx.db.stelo_wallet.linkId.find(linkId);
    const accountId = link === null ? null : steloAccountId(link);
    if (link === null || wallet === null || accountId === null
        || link.provider !== 'stelo' || link.revokedAt !== undefined
        || !link.accountIdentity.isEqual(accountIdentity) || wallet.currency !== currency) {
        throw new SenderError(CraftError.INVALID_FUNDING_WALLET);
    }
    if (ctx.db.stelo_wallet_status.linkId.find(linkId)?.verified !== true) {
        throw new SenderError(CraftError.FUNDING_WALLET_UNVERIFIED);
    }
    return accountId;
}

/** The Stelo account that should receive `payeePlayerId`'s payouts in `currency`, or null if they are unroutable. */
export function routePayeeWallet(ctx: Ctx, payeePlayerId: bigint, currency: string): bigint | null {
    for (const link of ctx.db.linked_integration.by_provider_external_id.filter(['bitcraft-ea2', payeePlayerId.toString()])) {
        if (link.revokedAt !== undefined) continue;
        for (const receiving of ctx.db.stelo_receiving_wallet.by_account_currency.filter([link.accountIdentity, currency])) {
            const walletLink = ctx.db.linked_integration.id.find(receiving.linkId);
            if (walletLink === null || walletLink.revokedAt !== undefined) continue;
            return steloAccountId(walletLink);
        }
    }
    return null;
}

export function findEscrowWallet(ctx: Ctx, payer: Identity, currency: string, fundingAccountId: bigint) {
    return [...ctx.db.bounty_escrow_wallet.by_payer_currency.filter([payer, currency])]
        .find(row => row.fundingAccountId === fundingAccountId) ?? null;
}

/** Adds `amount` to what `fundingAccountId` is owed back from escrow, creating its row on first use. */
export function addRefundDue(ctx: Ctx, payer: Identity, currency: string, fundingAccountId: bigint, amount: bigint): void {
    if (amount === 0n) return;
    const existing = findEscrowWallet(ctx, payer, currency, fundingAccountId);
    if (existing === null) {
        ctx.db.bounty_escrow_wallet.insert({
            id: 0n, payerAccountIdentity: payer, currency, fundingAccountId, refundDue: amount, updatedAt: ctx.timestamp,
        });
        return;
    }
    ctx.db.bounty_escrow_wallet.id.update({...existing, refundDue: existing.refundDue + amount, updatedAt: ctx.timestamp});
}

/**
 * Refund due that is free to move: not already covered by an unsettled refund and not reserved by an
 * unsettled top-up.
 */
export function reservableRefundDue(ctx: Ctx, payer: Identity, currency: string, fundingAccountId: bigint): bigint {
    const wallet = findEscrowWallet(ctx, payer, currency, fundingAccountId);
    if (wallet === null) return 0n;
    let free = wallet.refundDue;
    for (const transfer of ctx.db.stelo_transfer.payerAccountIdentity.filter(payer)) {
        if (transfer.state.tag !== 'pending' || transfer.currency !== currency) continue;
        if (transfer.purpose.tag === 'refund' && transfer.purpose.value.fundingAccountId === fundingAccountId) {
            free -= transfer.amount;
        } else if (transfer.purpose.tag === 'topUp' && transfer.fromAccountId === fundingAccountId) {
            free -= transfer.purpose.value.reserved;
        }
    }
    return free > 0n ? free : 0n;
}

/** Moves `amount` units of a craft's hold from "reserved for crafters" to its wallet's refund due. */
export function releaseFromEscrow(ctx: Ctx, escrow: EscrowRow, amount: bigint): EscrowRow {
    if (amount <= 0n) return escrow;
    addRefundDue(ctx, escrow.payerAccountIdentity, escrow.currency, escrow.fundingAccountId, amount);
    const updated = {...escrow, releasedAmount: escrow.releasedAmount + amount, updatedAt: ctx.timestamp};
    ctx.db.craft_bounty_escrow.id.update(updated);
    return updated;
}

/** Releases whatever of the open hold the craft hasn't accrued and closes it; no-op if none is open. */
export function closeOpenEscrow(ctx: Ctx, craftId: bigint): void {
    const escrow = findOpenEscrow(ctx, craftId);
    if (escrow === null) return;
    const accruedCeil = ceilRatio(escrowAccrued(escrow));
    const released = releaseFromEscrow(ctx, escrow, escrow.heldAmount - escrow.releasedAmount - accruedCeil);
    ctx.db.craft_bounty_escrow.id.update({...released, closedAt: ctx.timestamp, updatedAt: ctx.timestamp});
}

/** Lowers a hold's secured ratio and releases the headroom it no longer needs. */
export function cutEscrowRatio(ctx: Ctx, escrow: EscrowRow, ratio: Fraction): void {
    const required = escrowRequired(escrowAccrued(escrow), ratio, escrow.effortCovered, escrow.effortPriced);
    const surplus = escrow.heldAmount - escrow.releasedAmount - required;
    const released = releaseFromEscrow(ctx, escrow, surplus);
    ctx.db.craft_bounty_escrow.id.update({
        ...released, ratioNumerator: ratio.numerator, ratioDenominator: ratio.denominator, updatedAt: ctx.timestamp,
    });
}

export function findPool(ctx: Ctx, payer: Identity, payeePlayerId: bigint, currency: string, fundingAccountId: bigint): PoolRow | null {
    return [...ctx.db.bounty_escrow_pool.by_payer_payee.filter([payer, payeePlayerId])]
        .find(row => row.currency === currency && row.fundingAccountId === fundingAccountId) ?? null;
}

/**
 * Moves pulled extras the pool no longer owes (its guaranteed total grew past them, or it is paid up)
 * to its paying wallet's refund due. Call after any change to the pool's totals; returns the pool as stored.
 */
export function releaseSurplusExtras(ctx: Ctx, pool: PoolRow): PoolRow {
    const surplus = pool.pulledExtras - splitPayout(pool).fromWallet;
    if (surplus <= 0n) return pool;
    addRefundDue(ctx, pool.payerAccountIdentity, pool.currency, pool.fundingAccountId, surplus);
    const updated = {...pool, pulledExtras: pool.pulledExtras - surplus, updatedAt: ctx.timestamp};
    ctx.db.bounty_escrow_pool.id.update(updated);
    return updated;
}

export function poolFractions(pool: PoolRow): {full: Fraction; guaranteed: Fraction} {
    return {
        full: {numerator: pool.remainderNumerator, denominator: pool.remainderDenominator},
        guaranteed: {numerator: pool.guaranteedRemainderNumerator, denominator: pool.guaranteedRemainderDenominator},
    };
}

export function journal(
    ctx: Ctx,
    entry: {
        payer: Identity;
        currency: string;
        kind: JournalKind;
        amount: bigint;
        fundingAccountId: bigint;
        craftId?: bigint;
        payeePlayerId?: bigint;
        transferId: bigint;
    },
): void {
    ctx.db.bounty_escrow_journal.insert({
        id: 0n,
        payerAccountIdentity: entry.payer,
        currency: entry.currency,
        kind: entry.kind,
        amount: entry.amount,
        fundingAccountId: entry.fundingAccountId,
        craftId: entry.craftId,
        payeePlayerId: entry.payeePlayerId,
        transferId: entry.transferId,
        createdAt: ctx.timestamp,
    });
}

/** Adds `delta` to the surfaced (payer, payee, currency) `bounty_entitlement_total.total`, creating the row if needed. */
export function addSurfacedTotal(
    ctx: Ctx, payer: Identity, payeePlayerId: bigint, currency: string, delta: bigint, deltaEffort: bigint, updatedAt: Timestamp,
): void {
    const existing = [...ctx.db.bounty_entitlement_total.by_payer_payee.filter([payer, payeePlayerId])]
        .find(row => row.currency === currency);
    if (existing === undefined) {
        ctx.db.bounty_entitlement_total.insert({
            id: 0n, payerAccountIdentity: payer, payeePlayerId, currency,
            total: delta, totalEffort: deltaEffort, remainderNumerator: 0n, remainderDenominator: 1n, updatedAt,
        });
    } else {
        ctx.db.bounty_entitlement_total.id.update({
            ...existing, total: existing.total + delta, totalEffort: existing.totalEffort + deltaEffort, updatedAt,
        });
    }
}

/** Adds `amount` to the surfaced `bounty_payout_record.paidTotal` and appends a log row of the given `source`. */
export function addSurfacedPayment(
    ctx: Ctx, payer: Identity, payeePlayerId: bigint, currency: string, amount: bigint, source: string,
): void {
    const existing = [...ctx.db.bounty_payout_record.by_payer_payee.filter([payer, payeePlayerId])]
        .find(row => row.currency === currency);
    if (existing === undefined) {
        ctx.db.bounty_payout_record.insert({
            id: 0n, payerAccountIdentity: payer, payeePlayerId, currency, paidTotal: amount, updatedAt: ctx.timestamp,
        });
    } else {
        ctx.db.bounty_payout_record.id.update({...existing, paidTotal: existing.paidTotal + amount, updatedAt: ctx.timestamp});
    }
    ctx.db.bounty_payout_record_log.insert({
        id: 0n, payerAccountIdentity: payer, payeePlayerId, currency, amount, createdAt: ctx.timestamp, source,
    });
}

/** Drops the wallet rows of a `stelo` link that is being revoked. Shared by `unlinkIntegration`. */
export function removeSteloWallet(ctx: Ctx, linkId: bigint): void {
    const wallet = ctx.db.stelo_wallet.linkId.find(linkId);
    if (wallet === null) return;
    ctx.db.stelo_wallet.linkId.delete(linkId);
    ctx.db.stelo_wallet_status.linkId.delete(linkId);
    for (const receiving of [...ctx.db.stelo_receiving_wallet.by_account_currency.filter([wallet.accountIdentity, wallet.currency])]) {
        if (receiving.linkId === linkId) ctx.db.stelo_receiving_wallet.id.delete(receiving.id);
    }
}

/**
 * Checks a rule's or override's `fundingLinkId` against its currency: an escrowed currency needs one
 * of the caller's own active wallets on that currency; any other currency must not name a wallet.
 * Whether the bot can actually pull from the wallet is checked live by the bot.
 */
export function validateFundingWallet(ctx: Ctx, caller: Identity, currency: string, fundingLinkId: bigint | undefined): void {
    if (!isEscrowedCurrency(currency)) {
        if (fundingLinkId !== undefined) throw new SenderError(CraftError.FUNDING_WALLET_NOT_ALLOWED);
        return;
    }
    if (fundingLinkId === undefined) throw new SenderError(CraftError.FUNDING_WALLET_REQUIRED);
    requireActiveSteloWallet(ctx, caller, fundingLinkId, currency);
}
