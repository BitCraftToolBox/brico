import type {Identity, Timestamp} from 'spacetimedb';
import type {ReadDb} from '../schema';

/*
 * The per-account payout reports behind the `my_*` payout views and the `http/payouts.ts` routes.
 * Each takes the account identity explicitly because an HTTP handler has no `ctx.sender`.
 */

/**
 * Resolves a payer account's display name for the report views: its own `displayName` if
 * set; otherwise its oldest still-active `bitcraft-ea2` link's handle (preferring the longest-
 * standing proof of who they are over a more recent one); otherwise its most-recently-revoked
 * one's handle (a payer must have linked a BitCraft account at some point to have assigned a
 * bounty — unlinking doesn't let them out of an existing payer relationship); otherwise, for a
 * genuinely broken row (no handle recorded on the chosen link either), the identity itself.
 */
function resolvePayerDisplayName(db: ReadDb, payerAccountIdentity: Identity): string {
    const account = db.account.identity.find(payerAccountIdentity);
    if (account?.displayName) return account.displayName;

    let oldestActive: { linkedAt: Timestamp; externalHandle?: string } | null = null;
    let mostRecentRevoked: { revokedAt: Timestamp; externalHandle?: string } | null = null;
    for (const link of db.linked_integration.accountIdentity.filter(payerAccountIdentity)) {
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

/** `resolvePayerDisplayName` memoized per payer, for reports that repeat the same payer across rows. */
function cachedPayerDisplayName(db: ReadDb): (payerAccountIdentity: Identity) => string {
    const names = new Map<string, string>();
    return payerAccountIdentity => {
        const key = payerAccountIdentity.toHexString();
        let name = names.get(key);
        if (name === undefined) {
            name = resolvePayerDisplayName(db, payerAccountIdentity);
            names.set(key, name);
        }
        return name;
    };
}

/**
 * Resolves the brico account a payee player id should be grouped under for the manager-side
 * report, or `null` if it shouldn't be grouped at all. Only an *active* `bitcraft-ea2` link
 * counts, and only when that account has itself set a `displayName`: an unnamed account is
 * reported exactly as if the player id weren't linked.
 */
function resolvePayeeAccount(db: ReadDb, payeePlayerId: bigint): { identity: Identity; displayName: string } | null {
    for (const link of db.linked_integration.by_provider_external_id.filter(['bitcraft-ea2', payeePlayerId.toString()])) {
        if (link.revokedAt !== undefined) continue;
        const account = db.account.identity.find(link.accountIdentity);
        return account?.displayName ? {identity: account.identity, displayName: account.displayName} : null;
    }
    return null;
}

/** Every BitCraft player id the account has ever linked (`bitcraft-ea2`, revoked included). */
export function linkedPlayerIds(db: ReadDb, accountIdentity: Identity): Set<bigint> {
    const playerIds = new Set<bigint>();
    for (const link of db.linked_integration.accountIdentity.filter(accountIdentity)) {
        if (link.provider === 'bitcraft-ea2') playerIds.add(BigInt(link.externalId));
    }
    return playerIds;
}

/** The account's transaction log as a payer — every row `recordBountyPayment` appended under its identity. */
export function payoutLogAsPayer(db: ReadDb, accountIdentity: Identity) {
    const payerName = resolvePayerDisplayName(db, accountIdentity);
    return Array.from(db.bounty_payout_record_log.by_payer_payee.filter(accountIdentity), row => ({
        id: row.id,
        payerAccountIdentity: row.payerAccountIdentity,
        payerName,
        payeePlayerId: row.payeePlayerId,
        currency: row.currency,
        amount: row.amount,
        createdAt: row.createdAt,
        source: row.source,
        note: row.note,
    }));
}

/** The account's transaction log as a contributor, across every BitCraft player id it has ever linked. */
export function payoutLogAsContributor(db: ReadDb, accountIdentity: Identity) {
    const playerIds = linkedPlayerIds(db, accountIdentity);
    if (playerIds.size === 0) return [];

    const payerName = cachedPayerDisplayName(db);
    const log = [];
    for (const playerId of playerIds) {
        for (const row of db.bounty_payout_record_log.payeePlayerId.filter(playerId)) {
            log.push({
                id: row.id,
                payerAccountIdentity: row.payerAccountIdentity,
                payerName: payerName(row.payerAccountIdentity),
                payeePlayerId: row.payeePlayerId,
                currency: row.currency,
                amount: row.amount,
                createdAt: row.createdAt,
                source: row.source,
                note: row.note,
            });
        }
    }
    return log;
}

/**
 * The account's entitlements as a contributor, across every BitCraft player id it has ever linked
 * (`bitcraft-ea2`, revoked included — past earnings on a since-unlinked character are still
 * theirs): one row per (payer, currency) they've earned from or been paid by, summed off the two
 * totals tables directly.
 */
export function entitlementsAsContributor(db: ReadDb, accountIdentity: Identity) {
    const playerIds = linkedPlayerIds(db, accountIdentity);
    if (playerIds.size === 0) return [];

    const keyOf = (payer: Identity, playerId: bigint, currency: string) => `${payer.toHexString()}:${playerId}:${currency}`;
    const rows = new Map<string, { payerAccountIdentity: Identity; payeePlayerId: bigint; currency: string; effortTotal: bigint; earnedTotal: bigint; paidTotal: bigint }>();

    // `playerIds` is small in practice (a handful of linked characters at most), so a per-id
    // indexed lookup here beats a full scan of either totals table — a view must never fall back
    // to `.iter()` over a whole table when the caller only cares about a known, bounded id set.
    for (const playerId of playerIds) {
        for (const total of db.bounty_entitlement_total.payeePlayerId.filter(playerId)) {
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
        for (const paid of db.bounty_payout_record.payeePlayerId.filter(playerId)) {
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

    const payerName = cachedPayerDisplayName(db);
    return Array.from(rows.values(), row => ({
        id: keyOf(row.payerAccountIdentity, row.payeePlayerId, row.currency),
        payerAccountIdentity: row.payerAccountIdentity,
        payerName: payerName(row.payerAccountIdentity),
        payeePlayerId: row.payeePlayerId,
        currency: row.currency,
        effortTotal: row.effortTotal,
        earnedTotal: row.earnedTotal,
        paidTotal: row.paidTotal,
    }));
}

/**
 * The other direction of `entitlementsAsContributor`: every payee the account has bountied
 * (`payerAccountIdentity == accountIdentity` on both totals tables), one row per (payee player id,
 * currency), with the payee's grouping account resolved per `resolvePayeeAccount`.
 */
export function entitlementsAsPayer(db: ReadDb, accountIdentity: Identity) {
    const keyOf = (playerId: bigint, currency: string) => `${playerId}:${currency}`;
    const rows = new Map<string, { payeePlayerId: bigint; currency: string; effortTotal: bigint; earnedTotal: bigint; guaranteedTotal: bigint; paidTotal: bigint }>();

    for (const total of db.bounty_entitlement_total.by_payer_payee.filter(accountIdentity)) {
        rows.set(keyOf(total.payeePlayerId, total.currency), {
            payeePlayerId: total.payeePlayerId,
            currency: total.currency,
            effortTotal: total.totalEffort,
            earnedTotal: total.total,
            guaranteedTotal: 0n,
            paidTotal: 0n,
        });
    }
    for (const pool of db.bounty_escrow_pool.by_payer_payee.filter(accountIdentity)) {
        const row = rows.get(keyOf(pool.payeePlayerId, pool.currency));
        if (row) row.guaranteedTotal += pool.guaranteedTotal;
    }
    for (const paid of db.bounty_payout_record.by_payer_payee.filter(accountIdentity)) {
        const key = keyOf(paid.payeePlayerId, paid.currency);
        const row = rows.get(key);
        if (row) row.paidTotal = paid.paidTotal;
        else rows.set(key, {
            payeePlayerId: paid.payeePlayerId,
            currency: paid.currency,
            effortTotal: 0n,
            earnedTotal: 0n,
            guaranteedTotal: 0n,
            paidTotal: paid.paidTotal,
        });
    }

    return Array.from(rows.values(), row => {
        const account = resolvePayeeAccount(db, row.payeePlayerId);
        return {
            id: keyOf(row.payeePlayerId, row.currency),
            payeePlayerId: row.payeePlayerId,
            payeeAccountIdentity: account?.identity,
            payeeName: account?.displayName,
            currency: row.currency,
            effortTotal: row.effortTotal,
            earnedTotal: row.earnedTotal,
            guaranteedTotal: row.guaranteedTotal,
            paidTotal: row.paidTotal,
        };
    });
}
