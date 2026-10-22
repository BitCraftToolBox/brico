/**
 * books.ts — the bot's read-side view of the escrow books: what is pending, what is free to move.
 * These mirror the module's own checks, so the bot never records an intent the module would reject.
 */
import type {SteloTransfer} from "@brico/bindings/brico-app/types";
import type {Identity, Timestamp} from "spacetimedb";

import {type EscrowState, walletKey} from "../app/escrow-cache.ts";

/** Raw Stelo units for `amount` whole brico units on a ledger with `scale` decimal places. */
export function toSteloAmount(amount: bigint, scale: number): bigint {
    return amount * 10n ** BigInt(scale);
}

export function isPending(transfer: SteloTransfer): boolean {
    return transfer.state.tag === "Pending";
}

export function timestampMs(timestamp: Timestamp): number {
    return Number(timestamp.microsSinceUnixEpoch / 1000n);
}

/** Refund due for one paying wallet that is not already covered by a pending refund or reserved by a pending top-up. */
export function reservableRefundDue(state: EscrowState, payer: Identity, currency: string, fundingAccountId: bigint): bigint {
    const wallet = state.escrowWallets.get(walletKey(payer, currency, fundingAccountId));
    if (!wallet) return 0n;
    let free = wallet.refundDue;
    for (const transfer of state.transfers.values()) {
        if (!isPending(transfer) || transfer.currency !== currency || !transfer.payerAccountIdentity.isEqual(payer)) continue;
        const {purpose} = transfer;
        if (purpose.tag === "Refund" && purpose.value.fundingAccountId === fundingAccountId) free -= transfer.amount;
        else if (purpose.tag === "TopUp" && transfer.fromAccountId === fundingAccountId) free -= purpose.value.reserved;
    }
    return free > 0n ? free : 0n;
}
