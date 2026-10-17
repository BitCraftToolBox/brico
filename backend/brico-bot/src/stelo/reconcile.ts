/**
 * reconcile.ts — checks the escrow wallet's live Stelo balance against the books, and flags
 * transfers on it that no intent explains.
 */
import type {EscrowState} from "../app/escrow-cache.ts";
import type {SteloConfig} from "../config.ts";
import {refOfMemo} from "./memo.ts";
import type {SteloReadModel, SteloTransfer} from "./stelo-cache.ts";

export interface EscrowDrift {
    currency: string;
    /** Raw Stelo units the books say the escrow wallet should hold, counting transfers already posted but not yet settled. */
    expected: bigint;
    actual: bigint;
}

/**
 * Currencies whose escrow wallet balance differs from `Σ journal × 10^scale` plus the signed raw
 * amount of intents whose transfer is posted but not settled yet (money moved, books not updated)
 * and the net of posted transfers no intent explains (e.g. a stray deposit, which the books never
 * hold and which must not pause the bot). Currencies whose wallet isn't visible yet are skipped.
 */
export function findEscrowDrift(config: SteloConfig, escrow: EscrowState, stelo: SteloReadModel): EscrowDrift[] {
    const drifts: EscrowDrift[] = [];
    const unexplained = findUnknownEscrowTransfers(config, escrow, stelo);
    for (const [currency, {escrowAccountId}] of Object.entries(config.currencies)) {
        const account = stelo.account(escrowAccountId);
        if (!account) continue;

        let expected = (escrow.journalBalance.get(currency) ?? 0n) * 10n ** BigInt(account.ledgerScale);
        for (const intent of escrow.transfers.values()) {
            if (intent.state.tag !== "Pending" || intent.currency !== currency) continue;
            const posted = stelo.findPostedTransfer({
                ref: intent.ref, fromAccountId: intent.fromAccountId, toAccountId: intent.toAccountId, steloAmount: intent.steloAmount,
            });
            if (!posted) continue;
            if (intent.toAccountId === escrowAccountId) expected += intent.steloAmount;
            else if (intent.fromAccountId === escrowAccountId) expected -= intent.steloAmount;
        }
        for (const transfer of unexplained) {
            if (transfer.state.tag !== "Posted" || transfer.postedAmount === undefined) continue;
            // For an Asset transfer the receiver is the debited account and the sender the credited one.
            if (transfer.debitAccountId === escrowAccountId) expected += transfer.postedAmount;
            if (transfer.creditAccountId === escrowAccountId) expected -= transfer.postedAmount;
        }
        if (expected !== account.balance) drifts.push({currency, expected, actual: account.balance});
    }
    return drifts;
}

/**
 * Transfers touching an escrow wallet that no intent explains. A transfer is explained only when
 * its memo starts with an intent's ref *and* its accounts and posted amount match that intent, so a
 * stranger's transfer can't hide behind a copied memo.
 */
export function findUnknownEscrowTransfers(config: SteloConfig, escrow: EscrowState, stelo: SteloReadModel): SteloTransfer[] {
    const escrowAccounts = new Set(Object.values(config.currencies).map(c => c.escrowAccountId));
    const intents = new Map<string, {fromAccountId: bigint; toAccountId: bigint; steloAmount: bigint}>();
    for (const intent of escrow.transfers.values()) intents.set(intent.ref, intent);
    const unknown: SteloTransfer[] = [];
    for (const transfer of stelo.transfers()) {
        if (!escrowAccounts.has(transfer.debitAccountId) && !escrowAccounts.has(transfer.creditAccountId)) continue;
        const intent = transfer.memo === undefined ? undefined : intents.get(refOfMemo(transfer.memo));
        const explained = intent !== undefined && transfer.creditAccountId === intent.fromAccountId
            && transfer.debitAccountId === intent.toAccountId
            && (transfer.state.tag !== "Posted" || transfer.postedAmount === intent.steloAmount);
        if (!explained) unknown.push(transfer);
    }
    return unknown;
}
