// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {
    bounty_escrow_journal,
    bounty_escrow_pool,
    bounty_escrow_wallet,
    craft_bounty_escrow,
    craft_bounty_funding,
    stelo_receiving_wallet,
    stelo_transfer,
    stelo_wallet,
    stelo_wallet_status
} from '../tables/escrow';

// Every `all*` view below is the unfiltered feed `brico-bot` reads; it is empty for anyone else.

/** The caller's own escrow holds, as a payer. */
export const myCraftBountyEscrow = spacetimedb.view(
    {name: 'my_craft_bounty_escrow', public: true},
    t.array(craft_bounty_escrow.rowType),
    ctx => ctx.from.craft_bounty_escrow.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** What each of the caller's paying wallets is still owed back from escrow. */
export const myBountyEscrowWallet = spacetimedb.view(
    {name: 'my_bounty_escrow_wallet', public: true},
    t.array(bounty_escrow_wallet.rowType),
    ctx => ctx.from.bounty_escrow_wallet.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** The caller's own Stelo transfers as a payer, so funding failures are visible to them. */
export const mySteloTransfer = spacetimedb.view(
    {name: 'my_stelo_transfer', public: true},
    t.array(stelo_transfer.rowType),
    ctx => ctx.from.stelo_transfer.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** The caller's registered Stelo wallets. */
export const mySteloWallet = spacetimedb.view(
    {name: 'my_stelo_wallet', public: true},
    t.array(stelo_wallet.rowType),
    ctx => ctx.from.stelo_wallet.where(r => r.accountIdentity.eq(ctx.sender))
);

/** The caller's receiving wallet per currency. */
export const mySteloReceivingWallet = spacetimedb.view(
    {name: 'my_stelo_receiving_wallet', public: true},
    t.array(stelo_receiving_wallet.rowType),
    ctx => ctx.from.stelo_receiving_wallet.where(r => r.accountIdentity.eq(ctx.sender))
);

/** Why each of the caller's own escrowed bounties is or isn't funded. */
export const myCraftBountyFunding = spacetimedb.view(
    {name: 'my_craft_bounty_funding', public: true},
    t.array(craft_bounty_funding.rowType),
    ctx => ctx.from.craft_bounty_funding.where(r => r.payerAccountIdentity.eq(ctx.sender))
);

/** Whether the bot can pull from each of the caller's registered wallets. */
export const mySteloWalletStatus = spacetimedb.view(
    {name: 'my_stelo_wallet_status', public: true},
    t.array(stelo_wallet_status.rowType),
    ctx => ctx.from.stelo_wallet_status.where(r => r.accountIdentity.eq(ctx.sender))
);

export const allCraftBountyFunding = spacetimedb.view(
    {name: 'all_craft_bounty_funding', public: true},
    t.array(craft_bounty_funding.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_bounty_funding.where(_ => isTrusted);
    }
);

export const allSteloWalletStatus = spacetimedb.view(
    {name: 'all_stelo_wallet_status', public: true},
    t.array(stelo_wallet_status.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.stelo_wallet_status.where(_ => isTrusted);
    }
);

export const allCraftBountyEscrow = spacetimedb.view(
    {name: 'all_craft_bounty_escrow', public: true},
    t.array(craft_bounty_escrow.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_bounty_escrow.where(_ => isTrusted);
    }
);

export const allBountyEscrowWallet = spacetimedb.view(
    {name: 'all_bounty_escrow_wallet', public: true},
    t.array(bounty_escrow_wallet.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.bounty_escrow_wallet.where(_ => isTrusted);
    }
);

export const allBountyEscrowPool = spacetimedb.view(
    {name: 'all_bounty_escrow_pool', public: true},
    t.array(bounty_escrow_pool.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.bounty_escrow_pool.where(_ => isTrusted);
    }
);

export const allBountyEscrowJournal = spacetimedb.view(
    {name: 'all_bounty_escrow_journal', public: true},
    t.array(bounty_escrow_journal.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.bounty_escrow_journal.where(_ => isTrusted);
    }
);

export const allSteloTransfer = spacetimedb.view(
    {name: 'all_stelo_transfer', public: true},
    t.array(stelo_transfer.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.stelo_transfer.where(_ => isTrusted);
    }
);

export const allSteloWallet = spacetimedb.view(
    {name: 'all_stelo_wallet', public: true},
    t.array(stelo_wallet.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.stelo_wallet.where(_ => isTrusted);
    }
);

export const allSteloReceivingWallet = spacetimedb.view(
    {name: 'all_stelo_receiving_wallet', public: true},
    t.array(stelo_receiving_wallet.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.stelo_receiving_wallet.where(_ => isTrusted);
    }
);
