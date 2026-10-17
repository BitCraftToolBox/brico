/**
 * escrow-cache.ts — the `brico-app` escrow, transfer-intent and Stelo wallet tables, mirrored from
 * row callbacks. Kept apart from `AppCache` because only the Stelo step reads it; `version` tells
 * that step whether anything moved since it last ran.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {
    BountyEscrowJournal,
    BountyEscrowPool,
    BountyEscrowWallet,
    CraftBountyEscrow,
    CraftBountyFunding,
    DiscordFundingNotifyTarget,
    FundingNotifyTrigger,
    IntegrationLinkRequest,
    LinkedIntegration,
    SteloCurrencyPolicy,
    SteloPayoutSchedule,
    SteloReceivingWallet,
    SteloTransfer,
    SteloWallet,
    SteloWalletStatus,
} from "@brico/bindings/brico-app/types";
import type {Identity} from "spacetimedb";

import {keyedFeed, type TableFeed} from "../spacetime/feed.ts";

export const walletKey = (payer: Identity, currency: string, fundingAccountId: bigint) =>
    `${payer.toHexString()}:${currency}:${fundingAccountId}`;
export const receivingKey = (account: Identity, currency: string) => `${account.toHexString()}:${currency}`;
export const poolKey = (payer: Identity, payee: bigint, currency: string, fundingAccountId: bigint) =>
    `${payer.toHexString()}:${payee}:${currency}:${fundingAccountId}`;

export interface EscrowState {
    /** The open (not closed) escrow hold per craft. */
    readonly openEscrows: ReadonlyMap<bigint, CraftBountyEscrow>;
    /** Refund-due rows by `walletKey`. */
    readonly escrowWallets: ReadonlyMap<string, BountyEscrowWallet>;
    /** Entitlement pools by `poolKey`. */
    readonly pools: ReadonlyMap<string, BountyEscrowPool>;
    /** Σ `bounty_escrow_journal.amount` per currency — what the escrow wallet should hold. */
    readonly journalBalance: ReadonlyMap<string, bigint>;
    /** Every Stelo transfer intent by id. */
    readonly transfers: ReadonlyMap<bigint, SteloTransfer>;
    /** Active `stelo` links by link id. */
    readonly steloLinks: ReadonlyMap<bigint, LinkedIntegration>;
    readonly steloWallets: ReadonlyMap<bigint, SteloWallet>;
    /** By `receivingKey`. */
    readonly receivingWallets: ReadonlyMap<string, SteloReceivingWallet>;
    /** Pending `stelo` link requests by code. */
    readonly linkRequests: ReadonlyMap<string, IntegrationLinkRequest>;
    readonly schedule: SteloPayoutSchedule | undefined;
    /** The published unclaimed-money policy per currency. */
    readonly policies: ReadonlyMap<string, SteloCurrencyPolicy>;
    /** The funding-status row per craft. */
    readonly fundingRows: ReadonlyMap<bigint, CraftBountyFunding>;
    /** The last `canPull` written per wallet link id. */
    readonly walletStatuses: ReadonlyMap<bigint, SteloWalletStatus>;
    /** Live (not tombstoned) funding-alert triggers by id. */
    readonly fundingTriggers: ReadonlyMap<string, FundingNotifyTrigger>;
    /** Live Discord funding-alert targets by id. */
    readonly fundingTargets: ReadonlyMap<string, DiscordFundingNotifyTarget>;
}

export interface EscrowCache {
    readonly craftBountyEscrow: TableFeed<CraftBountyEscrow>;
    readonly escrowWallet: TableFeed<BountyEscrowWallet>;
    readonly escrowPool: TableFeed<BountyEscrowPool>;
    readonly escrowJournal: TableFeed<BountyEscrowJournal>;
    readonly steloTransfer: TableFeed<SteloTransfer>;
    readonly linkedIntegration: TableFeed<LinkedIntegration>;
    readonly steloWallet: TableFeed<SteloWallet>;
    readonly steloReceivingWallet: TableFeed<SteloReceivingWallet>;
    readonly integrationLinkRequest: TableFeed<IntegrationLinkRequest>;
    readonly payoutSchedule: TableFeed<SteloPayoutSchedule>;
    readonly currencyPolicy: TableFeed<SteloCurrencyPolicy>;
    readonly craftBountyFunding: TableFeed<CraftBountyFunding>;
    readonly steloWalletStatus: TableFeed<SteloWalletStatus>;
    readonly fundingNotifyTrigger: TableFeed<FundingNotifyTrigger>;
    readonly discordFundingNotifyTarget: TableFeed<DiscordFundingNotifyTarget>;
    load(conn: DbConnection): void;
    readonly state: EscrowState;
    /** Incremented on every change. */
    readonly version: number;
}

export function createEscrowCache(): EscrowCache {
    const openEscrows = new Map<bigint, CraftBountyEscrow>();
    const escrowWallets = new Map<string, BountyEscrowWallet>();
    const pools = new Map<string, BountyEscrowPool>();
    const journalBalance = new Map<string, bigint>();
    const transfers = new Map<bigint, SteloTransfer>();
    const steloLinks = new Map<bigint, LinkedIntegration>();
    const steloWallets = new Map<bigint, SteloWallet>();
    const receivingWallets = new Map<string, SteloReceivingWallet>();
    const linkRequests = new Map<string, IntegrationLinkRequest>();
    const fundingRows = new Map<bigint, CraftBountyFunding>();
    const walletStatuses = new Map<bigint, SteloWalletStatus>();
    const fundingTriggers = new Map<string, FundingNotifyTrigger>();
    const fundingTargets = new Map<string, DiscordFundingNotifyTarget>();
    const policies = new Map<string, SteloCurrencyPolicy>();
    let schedule: SteloPayoutSchedule | undefined;
    let version = 0;
    const bump = () => void (version += 1);

    const setEscrow = (row: CraftBountyEscrow) => {
        if (row.closedAt === undefined) openEscrows.set(row.craftId, row);
        else if (openEscrows.get(row.craftId)?.id === row.id) openEscrows.delete(row.craftId);
        bump();
    };
    const removeEscrow = (row: CraftBountyEscrow) => {
        if (openEscrows.get(row.craftId)?.id === row.id) openEscrows.delete(row.craftId);
        bump();
    };
    const setLink = (row: LinkedIntegration) => {
        if (row.provider !== "stelo" || row.revokedAt !== undefined) steloLinks.delete(row.id);
        else steloLinks.set(row.id, row);
        bump();
    };
    const setRequest = (row: IntegrationLinkRequest) => {
        if (row.provider === "stelo") linkRequests.set(row.code, row);
        bump();
    };
    const poolOf = (row: BountyEscrowPool) => poolKey(row.payerAccountIdentity, row.payeePlayerId, row.currency, row.fundingAccountId);
    const walletOf = (row: BountyEscrowWallet) => walletKey(row.payerAccountIdentity, row.currency, row.fundingAccountId);
    const receivingOf = (row: SteloReceivingWallet) => receivingKey(row.accountIdentity, row.currency);

    const setTrigger = (row: FundingNotifyTrigger) => {
        if (row.deletedAt === undefined) fundingTriggers.set(row.id, row);
        else fundingTriggers.delete(row.id);
        bump();
    };
    const setTarget = (row: DiscordFundingNotifyTarget) => {
        if (row.deletedAt === undefined) fundingTargets.set(row.id, row);
        else fundingTargets.delete(row.id);
        bump();
    };

    const cache: EscrowCache = {
        craftBountyEscrow: {insert: setEscrow, update: (_before, after) => setEscrow(after), delete: removeEscrow},
        escrowWallet: keyedFeed(walletOf, row => (escrowWallets.set(walletOf(row), row), bump()), row => (escrowWallets.delete(walletOf(row)), bump())),
        escrowPool: keyedFeed(poolOf, row => (pools.set(poolOf(row), row), bump()), row => (pools.delete(poolOf(row)), bump())),
        // Journal rows are insert-only; the running balance is all that is kept.
        escrowJournal: {
            insert: row => (journalBalance.set(row.currency, (journalBalance.get(row.currency) ?? 0n) + row.amount), bump()),
            update: () => {},
            delete: () => {},
        },
        steloTransfer: keyedFeed(row => row.id, row => (transfers.set(row.id, row), bump()), row => (transfers.delete(row.id), bump())),
        linkedIntegration: keyedFeed(row => row.id, setLink, row => (steloLinks.delete(row.id), bump())),
        steloWallet: keyedFeed(row => row.linkId, row => (steloWallets.set(row.linkId, row), bump()), row => (steloWallets.delete(row.linkId), bump())),
        steloReceivingWallet: keyedFeed(receivingOf, row => (receivingWallets.set(receivingOf(row), row), bump()), row => (receivingWallets.delete(receivingOf(row)), bump())),
        integrationLinkRequest: keyedFeed(row => row.code, setRequest, row => (linkRequests.delete(row.code), bump())),
        craftBountyFunding: keyedFeed(row => row.craftId, row => (fundingRows.set(row.craftId, row), bump()), row => (fundingRows.delete(row.craftId), bump())),
        steloWalletStatus: keyedFeed(row => row.linkId, row => (walletStatuses.set(row.linkId, row), bump()), row => (walletStatuses.delete(row.linkId), bump())),
        fundingNotifyTrigger: keyedFeed(row => row.id, setTrigger, row => (fundingTriggers.delete(row.id), bump())),
        discordFundingNotifyTarget: keyedFeed(row => row.id, setTarget, row => (fundingTargets.delete(row.id), bump())),
        currencyPolicy: keyedFeed(row => row.currency, row => (policies.set(row.currency, row), bump()), row => (policies.delete(row.currency), bump())),
        payoutSchedule: {
            insert: row => ((schedule = row), bump()),
            update: (_before, after) => ((schedule = after), bump()),
            delete: () => ((schedule = undefined), bump()),
        },

        load(conn) {
            for (const map of [openEscrows, escrowWallets, pools, journalBalance, transfers, steloLinks, steloWallets, receivingWallets, linkRequests, fundingRows, walletStatuses, fundingTriggers, fundingTargets, policies] as Map<unknown, unknown>[]) {
                map.clear();
            }
            const {db} = conn;
            for (const row of db.allCraftBountyEscrow.iter()) setEscrow(row);
            for (const row of db.allBountyEscrowWallet.iter()) escrowWallets.set(walletOf(row), row);
            for (const row of db.allBountyEscrowPool.iter()) pools.set(poolOf(row), row);
            for (const row of db.allBountyEscrowJournal.iter()) cache.escrowJournal.insert(row);
            for (const row of db.allSteloTransfer.iter()) transfers.set(row.id, row);
            for (const row of db.allLinkedIntegration.iter()) setLink(row);
            for (const row of db.allSteloWallet.iter()) steloWallets.set(row.linkId, row);
            for (const row of db.allSteloReceivingWallet.iter()) receivingWallets.set(receivingOf(row), row);
            for (const row of db.allIntegrationLinkRequest.iter()) setRequest(row);
            for (const row of db.allCraftBountyFunding.iter()) fundingRows.set(row.craftId, row);
            for (const row of db.allSteloWalletStatus.iter()) walletStatuses.set(row.linkId, row);
            for (const row of db.allFundingNotifyTrigger.iter()) setTrigger(row);
            for (const row of db.allDiscordFundingNotifyTarget.iter()) setTarget(row);
            for (const row of db.steloCurrencyPolicy.iter()) policies.set(row.currency, row);
            schedule = [...db.steloPayoutSchedule.iter()][0];
            bump();
        },

        state: {
            openEscrows,
            escrowWallets,
            pools,
            journalBalance,
            transfers,
            steloLinks,
            steloWallets,
            receivingWallets,
            linkRequests,
            fundingRows,
            walletStatuses,
            fundingTriggers,
            fundingTargets,
            policies,
            get schedule() {
                return schedule;
            },
        },
        get version() {
            return version;
        },
    };
    return cache;
}
