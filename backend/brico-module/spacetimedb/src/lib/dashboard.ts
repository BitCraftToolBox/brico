import type {Identity} from 'spacetimedb';
import type {ReadDb} from '../schema';
import {hashApiToken} from './apiKeys';
import {entitlementsAsPayer, linkedPlayerIds} from './payouts';

/** The account that owns `token` if it is an API key with `publicDashboard`, else `null`. */
export function publicDashboardOwner(db: ReadDb, token: string): {owner: Identity, name: string} | null {
    const key = db.api_key.tokenHash.find(hashApiToken(token));
    return key !== null && key.publicDashboard ? {owner: key.accountIdentity, name: key.name} : null;
}

/**
 * The account's payees, shared by `GET /dashboard` and the `dashboard_*` views. The key is meant to
 * be shared, so this leaves out anything that identifies accounts or wallets (identities,
 * escrow/guaranteed totals, payment history).
 *
 * The owner's own players are left out. Payees are one row per (payee, currency), with players of one brico account (one that has set a
 * display name) merged under that name. `payeePlayerId` is the player's own id, or the lowest id of the merged ones.
 */
export function dashboardPayees(db: ReadDb, accountIdentity: Identity) {
    const payees = new Map<string, {
        payeePlayerId: bigint;
        payeeName: string | undefined;
        currency: string;
        effortTotal: bigint;
        earnedTotal: bigint;
        paidTotal: bigint;
    }>();
    const ownPlayerIds = linkedPlayerIds(db, accountIdentity);
    for (const row of entitlementsAsPayer(db, accountIdentity)) {
        if (ownPlayerIds.has(row.payeePlayerId) || row.payeeAccountIdentity?.isEqual(accountIdentity)) continue;
        const key = `${row.payeeAccountIdentity?.toHexString() ?? `player:${row.payeePlayerId}`}:${row.currency}`;
        const existing = payees.get(key);
        if (existing) {
            if (row.payeePlayerId < existing.payeePlayerId) existing.payeePlayerId = row.payeePlayerId;
            existing.effortTotal += row.effortTotal;
            existing.earnedTotal += row.earnedTotal;
            existing.paidTotal += row.paidTotal;
        } else {
            payees.set(key, {
                payeePlayerId: row.payeePlayerId,
                payeeName: row.payeeName,
                currency: row.currency,
                effortTotal: row.effortTotal,
                earnedTotal: row.earnedTotal,
                paidTotal: row.paidTotal,
            });
        }
    }
    return [...payees.values()];
}

/** The account's active bounties, public and private. */
export function dashboardBounties(db: ReadDb, accountIdentity: Identity) {
    const bounty = (isPrivate: boolean) => (row: {
        craftId: bigint;
        ratioNumerator: bigint;
        ratioDenominator: bigint;
        currency: string;
    }) => ({
        craftId: row.craftId,
        ratioNumerator: row.ratioNumerator,
        ratioDenominator: row.ratioDenominator,
        currency: row.currency,
        private: isPrivate,
    });
    return [
        ...Array.from(db.craft_bounty_assignment.assignedByAccountIdentity.filter(accountIdentity), bounty(false)),
        ...Array.from(db.craft_private_bounty_assignment.assignedByAccountIdentity.filter(accountIdentity), bounty(true)),
    ];
}

/** The feed behind `GET /dashboard`. */
export function dashboardReport(db: ReadDb, accountIdentity: Identity) {
    return {payees: dashboardPayees(db, accountIdentity), bounties: dashboardBounties(db, accountIdentity)};
}
