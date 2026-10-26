import type {Identity} from 'spacetimedb';
import type {ReadDb} from '../schema';
import {entitlementsAsPayer, linkedPlayerIds} from './payouts';

/**
 * The feed behind `GET /dashboard`: the account's payees and its active bounties, public and
 * private. The key is meant to be shared, so this leaves out anything that identifies accounts or
 * wallets (identities, escrow/guaranteed totals, payment history).
 *
 * The owner's own players are left out of the payees. Payees are one row per (payee, currency), with players of one brico account (one that has set a
 * display name) merged under that name. `payeePlayerId` is the player's own id, or the lowest id of the merged ones.
 */
export function dashboardReport(db: ReadDb, accountIdentity: Identity) {
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
    const bounties = [
        ...Array.from(db.craft_bounty_assignment.assignedByAccountIdentity.filter(accountIdentity), bounty(false)),
        ...Array.from(db.craft_private_bounty_assignment.assignedByAccountIdentity.filter(accountIdentity), bounty(true)),
    ];

    return {payees: [...payees.values()], bounties};
}
