/**
 * writes.ts — the `brico-app` reducer calls the Stelo step makes, behind an interface so the
 * funding/payout logic can be tested without a connection.
 */
import type {SteloTransferPurpose} from "@brico/bindings/brico-app/types";
import type {Identity} from "spacetimedb";
import {Timestamp} from "spacetimedb";

import type {BricoAppConnection} from "../app/connection.ts";
import {timeReducerCall} from "../metrics.ts";

export interface TransferIntentArgs {
    currency: string;
    payer: Identity;
    fromAccountId: bigint;
    toAccountId: bigint;
    /** Whole brico units. */
    amount: bigint;
    /** Raw Stelo units, frozen here so a replay is byte-identical. */
    steloAmount: bigint;
    purpose: SteloTransferPurpose;
}

/** One `craft_bounty_funding` row (everything but `updatedAt`). */
export interface FundingRow {
    craftId: bigint;
    payer: Identity;
    source: string;
    ruleId: string | undefined;
    currency: string;
    fundingLinkId: bigint | undefined;
    ratioNumerator: bigint;
    ratioDenominator: bigint;
    state: string;
    reason: string | undefined;
    transferId: bigint | undefined;
}

/** A funding notification's payload. */
export interface FundingAlert {
    kind: string;
    role: string;
    currency: string;
    craftId: bigint | undefined;
    amount: bigint | undefined;
    reason: string | undefined;
    payerName: string | undefined;
    payeeName: string | undefined;
}

export interface SteloWrites {
    recordIntent(args: TransferIntentArgs): Promise<void>;
    settleTransfer(id: bigint, steloTransferId: bigint): Promise<void>;
    failTransfer(id: bigint, reason: string): Promise<void>;
    raiseFromRefundDue(craftId: bigint, ratioNumerator: bigint, ratioDenominator: bigint): Promise<void>;
    closeCraftEscrow(craftId: bigint): Promise<void>;
    releaseOverlap(payer: Identity, payeePlayerId: bigint, currency: string): Promise<void>;
    syncUnclaimed(payer: Identity, payeePlayerId: bigint, currency: string, fundingAccountId: bigint): Promise<void>;
    settleUnclaimed(payer: Identity, payeePlayerId: bigint, currency: string, fundingAccountId: bigint, rollTo: string | undefined): Promise<void>;
    setPayoutSchedule(intervalMicros: bigint, lastSweepAt: Timestamp): Promise<void>;
    setCurrencyPolicy(currency: string, action: string, rollTo: string | undefined, afterDays: number): Promise<void>;
    noteLinkExternal(code: string, accountId: bigint, address: string): Promise<void>;
    noteLinkStatus(code: string, reason: string, matchedUsername: string | undefined): Promise<void>;
    registerWallet(linkId: bigint, currency: string): Promise<void>;
    setWalletStatus(linkId: bigint, canPull: boolean, verified: boolean): Promise<void>;
    setFunding(row: FundingRow): Promise<void>;
    clearFunding(craftId: bigint): Promise<void>;
    postFundingNotification(account: Identity, payload: FundingAlert): Promise<void>;
}

/** The writes over the live `brico-app` connection; each rejects if the connection is down. */
export function createSteloWrites(app: BricoAppConnection, refPrefix: string): SteloWrites {
    const conn = () => {
        const live = app.connection?.connection;
        if (!live?.isActive || !app.isLive) throw new Error("unavailable: brico-app connection is not live");
        return live;
    };
    return {
        recordIntent: args => timeReducerCall("record_stelo_transfer_intent", conn().reducers.recordSteloTransferIntent({
            refPrefix,
            currency: args.currency,
            payerAccountIdentity: args.payer,
            fromAccountId: args.fromAccountId,
            toAccountId: args.toAccountId,
            amount: args.amount,
            steloAmount: args.steloAmount,
            purpose: args.purpose,
        })),
        settleTransfer: (id, steloTransferId) => timeReducerCall("settle_stelo_transfer", conn().reducers.settleSteloTransfer({id, steloTransferId})),
        failTransfer: (id, reason) => timeReducerCall("fail_stelo_transfer", conn().reducers.failSteloTransfer({id, reason})),
        raiseFromRefundDue: (craftId, ratioNumerator, ratioDenominator) =>
            timeReducerCall("raise_craft_escrow_from_refund_due", conn().reducers.raiseCraftEscrowFromRefundDue({craftId, ratioNumerator, ratioDenominator})),
        closeCraftEscrow: craftId => timeReducerCall("close_craft_escrow", conn().reducers.closeCraftEscrow({craftId})),
        releaseOverlap: (payer, payeePlayerId, currency) =>
            timeReducerCall("release_escrow_overlap", conn().reducers.releaseEscrowOverlap({payerAccountIdentity: payer, payeePlayerId, currency})),
        syncUnclaimed: (payer, payeePlayerId, currency, fundingAccountId) =>
            timeReducerCall("sync_escrow_pool_unclaimed", conn().reducers.syncEscrowPoolUnclaimed({payerAccountIdentity: payer, payeePlayerId, currency, fundingAccountId})),
        settleUnclaimed: (payer, payeePlayerId, currency, fundingAccountId, rollTo) =>
            timeReducerCall("settle_unclaimed_payee", conn().reducers.settleUnclaimedPayee({payerAccountIdentity: payer, payeePlayerId, currency, fundingAccountId, rollTo})),
        setPayoutSchedule: (intervalMicros, lastSweepAt) =>
            timeReducerCall("set_stelo_payout_schedule", conn().reducers.setSteloPayoutSchedule({intervalMicros, lastSweepAt})),
        setCurrencyPolicy: (currency, action, rollTo, afterDays) =>
            timeReducerCall("set_stelo_currency_policy", conn().reducers.setSteloCurrencyPolicy({currency, action, rollTo, afterDays})),
        noteLinkExternal: (code, accountId, address) =>
            timeReducerCall("note_integration_link_external", conn().reducers.noteIntegrationLinkExternal({code, externalId: accountId.toString(), externalHandle: address})),
        noteLinkStatus: (code, reason, matchedUsername) =>
            timeReducerCall("note_integration_link_status", conn().reducers.noteIntegrationLinkStatus({code, reason, matchedUsername})),
        registerWallet: (linkId, currency) => timeReducerCall("register_stelo_wallet", conn().reducers.registerSteloWallet({linkId, currency})),
        setWalletStatus: (linkId, canPull, verified) =>
            timeReducerCall("set_stelo_wallet_status", conn().reducers.setSteloWalletStatus({linkId, canPull, verified})),
        setFunding: row => timeReducerCall("set_craft_bounty_funding", conn().reducers.setCraftBountyFunding({
            craftId: row.craftId,
            payerAccountIdentity: row.payer,
            source: row.source,
            ruleId: row.ruleId,
            currency: row.currency,
            fundingLinkId: row.fundingLinkId,
            ratioNumerator: row.ratioNumerator,
            ratioDenominator: row.ratioDenominator,
            state: row.state,
            reason: row.reason,
            transferId: row.transferId,
        })),
        clearFunding: craftId => timeReducerCall("clear_craft_bounty_funding", conn().reducers.clearCraftBountyFunding({craftId})),
        postFundingNotification: (account, payload) =>
            timeReducerCall("post_funding_notification", conn().reducers.postFundingNotification({accountIdentity: account, payload})),
    };
}
