/**
 * connection.ts — the bridge's *second* SpacetimeDB connection, to brico's own `brico-app` module.
 */
import {DbConnection, type SubscriptionHandle, tables} from "@brico/bindings/brico-app";
import type {RowTypedQuery} from "spacetimedb";

import type {SpacetimeTarget} from "../config.ts";
import type {Logger} from "../log.ts";
import {appDriftTotal, startStep} from "../metrics.ts";
import {createSupervisedConnection, type SupervisedConnection, type SupervisorOptions} from "../spacetime/connection.ts";
import {attachFeed} from "../spacetime/feed.ts";
import {type AppCache, findAppDrift} from "./app-cache.ts";
import type {EscrowCache} from "./escrow-cache.ts";

interface AppTable {
    /** Generated query builder for the subscription. */
    query: RowTypedQuery<any, any>;
    /** Row-change callbacks, so the bridge re-reads when the module's state moves. */
    listen(conn: DbConnection, onChange: () => void): void;
    /** Row count, for the "the second socket really carries rows" log line. */
    count(conn: DbConnection): bigint;
}

/**
 * Tables/views the bridge knows how to subscribe to on `brico-app`, keyed by SQL name.
 *
 * `all_saved_craft_filter`/`all_craft_filter_notify_trigger` are the tables the bridge reads its
 * filters from; the real join lives in `watch-source.ts`'s `createAccountWatchSource`.
 */
const APP_TABLES: Record<string, AppTable> = {
    all_account: {
        query: tables.allAccount,
        listen: (conn, onChange) => {
            conn.db.allAccount.onInsert(onChange);
            conn.db.allAccount.onDelete(onChange);
            conn.db.allAccount.onUpdate(onChange);
        },
        count: conn => conn.db.allAccount.count(),
    },
    all_linked_integration: {
        query: tables.allLinkedIntegration,
        listen: (conn, onChange) => {
            conn.db.allLinkedIntegration.onInsert(onChange);
            conn.db.allLinkedIntegration.onDelete(onChange);
            conn.db.allLinkedIntegration.onUpdate(onChange);
        },
        count: conn => conn.db.allLinkedIntegration.count(),
    },
    all_saved_craft_filter: {
        query: tables.allSavedCraftFilter,
        listen: (conn, onChange) => {
            conn.db.allSavedCraftFilter.onInsert(onChange);
            conn.db.allSavedCraftFilter.onDelete(onChange);
            conn.db.allSavedCraftFilter.onUpdate(onChange);
        },
        count: conn => conn.db.allSavedCraftFilter.count(),
    },
    all_craft_filter_notify_trigger: {
        query: tables.allCraftFilterNotifyTrigger,
        listen: (conn, onChange) => {
            conn.db.allCraftFilterNotifyTrigger.onInsert(onChange);
            conn.db.allCraftFilterNotifyTrigger.onDelete(onChange);
            conn.db.allCraftFilterNotifyTrigger.onUpdate(onChange);
        },
        count: conn => conn.db.allCraftFilterNotifyTrigger.count(),
    },
    all_discord_notify_sink: {
        query: tables.allDiscordNotifySink,
        listen: (conn, onChange) => {
            conn.db.allDiscordNotifySink.onInsert(onChange);
            conn.db.allDiscordNotifySink.onDelete(onChange);
            conn.db.allDiscordNotifySink.onUpdate(onChange);
        },
        count: conn => conn.db.allDiscordNotifySink.count(),
    },
    all_discord_notify_target: {
        query: tables.allDiscordNotifyTarget,
        listen: (conn, onChange) => {
            conn.db.allDiscordNotifyTarget.onInsert(onChange);
            conn.db.allDiscordNotifyTarget.onDelete(onChange);
            conn.db.allDiscordNotifyTarget.onUpdate(onChange);
        },
        count: conn => conn.db.allDiscordNotifyTarget.count(),
    },
    all_bounty_rule: {
        query: tables.allBountyRule,
        listen: (conn, onChange) => {
            conn.db.allBountyRule.onInsert(onChange);
            conn.db.allBountyRule.onDelete(onChange);
            conn.db.allBountyRule.onUpdate(onChange);
        },
        count: conn => conn.db.allBountyRule.count(),
    },
    all_craft_bounty_override: {
        query: tables.allCraftBountyOverride,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyOverride.onInsert(onChange);
            conn.db.allCraftBountyOverride.onDelete(onChange);
            conn.db.allCraftBountyOverride.onUpdate(onChange);
        },
        count: conn => conn.db.allCraftBountyOverride.count(),
    },
    all_craft_bounty_assignment: {
        query: tables.allCraftBountyAssignment,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyAssignment.onInsert(onChange);
            conn.db.allCraftBountyAssignment.onDelete(onChange);
            conn.db.allCraftBountyAssignment.onUpdate(onChange);
        },
        // this is currently only used for the emptiness check to ensure service principal
        // so we fake a 0 for this one table as it's always public
        count: _ => 0n, // conn.db.allCraftBountyAssignment.count(),
    },
    all_private_craft_bounty_assignment: {
        query: tables.allPrivateCraftBountyAssignment,
        listen: (conn, onChange) => {
            conn.db.allPrivateCraftBountyAssignment.onInsert(onChange);
            conn.db.allPrivateCraftBountyAssignment.onDelete(onChange);
            conn.db.allPrivateCraftBountyAssignment.onUpdate(onChange);
        },
        count: conn => conn.db.allPrivateCraftBountyAssignment.count(),
    },
    all_craft_bounty_entitlement: {
        query: tables.allCraftBountyEntitlement,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyEntitlement.onInsert(onChange);
            conn.db.allCraftBountyEntitlement.onDelete(onChange);
            conn.db.allCraftBountyEntitlement.onUpdate(onChange);
        },
        count: conn => conn.db.allCraftBountyEntitlement.count(),
    },
    all_loyalty_reward: {
        query: tables.allLoyaltyReward,
        listen: (conn, onChange) => {
            conn.db.allLoyaltyReward.onInsert(onChange);
            conn.db.allLoyaltyReward.onDelete(onChange);
            conn.db.allLoyaltyReward.onUpdate(onChange);
        },
        count: conn => conn.db.allLoyaltyReward.count(),
    },
    all_loyalty_rule: {
        query: tables.allLoyaltyRule,
        listen: (conn, onChange) => {
            conn.db.allLoyaltyRule.onInsert(onChange);
            conn.db.allLoyaltyRule.onDelete(onChange);
            conn.db.allLoyaltyRule.onUpdate(onChange);
        },
        count: conn => conn.db.allLoyaltyRule.count(),
    },
    all_loyalty_bonus_total: {
        query: tables.allLoyaltyBonusTotal,
        listen: (conn, onChange) => {
            conn.db.allLoyaltyBonusTotal.onInsert(onChange);
            conn.db.allLoyaltyBonusTotal.onDelete(onChange);
            conn.db.allLoyaltyBonusTotal.onUpdate(onChange);
        },
        count: conn => conn.db.allLoyaltyBonusTotal.count(),
    },
    all_bounty_entitlement_total: {
        query: tables.allBountyEntitlementTotal,
        listen: (conn, onChange) => {
            conn.db.allBountyEntitlementTotal.onInsert(onChange);
            conn.db.allBountyEntitlementTotal.onDelete(onChange);
            conn.db.allBountyEntitlementTotal.onUpdate(onChange);
        },
        count: conn => conn.db.allBountyEntitlementTotal.count(),
    },
    all_discord_watch_display: {
        query: tables.allDiscordWatchDisplay,
        listen: (conn, onChange) => {
            conn.db.allDiscordWatchDisplay.onInsert(onChange);
            conn.db.allDiscordWatchDisplay.onDelete(onChange);
            conn.db.allDiscordWatchDisplay.onUpdate(onChange);
        },
        count: conn => conn.db.allDiscordWatchDisplay.count(),
    },
    all_discord_guild_install: {
        query: tables.allDiscordGuildInstall,
        listen: (conn, onChange) => {
            conn.db.allDiscordGuildInstall.onInsert(onChange);
            conn.db.allDiscordGuildInstall.onDelete(onChange);
            conn.db.allDiscordGuildInstall.onUpdate(onChange);
        },
        count: conn => conn.db.allDiscordGuildInstall.count(),
    },
    all_craft_bounty_escrow: {
        query: tables.allCraftBountyEscrow,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyEscrow.onInsert(onChange);
            conn.db.allCraftBountyEscrow.onDelete(onChange);
            conn.db.allCraftBountyEscrow.onUpdate(onChange);
        },
        count: conn => conn.db.allCraftBountyEscrow.count(),
    },
    all_bounty_escrow_wallet: {
        query: tables.allBountyEscrowWallet,
        listen: (conn, onChange) => {
            conn.db.allBountyEscrowWallet.onInsert(onChange);
            conn.db.allBountyEscrowWallet.onDelete(onChange);
            conn.db.allBountyEscrowWallet.onUpdate(onChange);
        },
        count: conn => conn.db.allBountyEscrowWallet.count(),
    },
    all_bounty_escrow_pool: {
        query: tables.allBountyEscrowPool,
        listen: (conn, onChange) => {
            conn.db.allBountyEscrowPool.onInsert(onChange);
            conn.db.allBountyEscrowPool.onDelete(onChange);
            conn.db.allBountyEscrowPool.onUpdate(onChange);
        },
        count: conn => conn.db.allBountyEscrowPool.count(),
    },
    all_bounty_escrow_journal: {
        query: tables.allBountyEscrowJournal,
        listen: (conn, onChange) => {
            conn.db.allBountyEscrowJournal.onInsert(onChange);
            conn.db.allBountyEscrowJournal.onDelete(onChange);
            conn.db.allBountyEscrowJournal.onUpdate(onChange);
        },
        count: conn => conn.db.allBountyEscrowJournal.count(),
    },
    all_stelo_transfer: {
        query: tables.allSteloTransfer,
        listen: (conn, onChange) => {
            conn.db.allSteloTransfer.onInsert(onChange);
            conn.db.allSteloTransfer.onDelete(onChange);
            conn.db.allSteloTransfer.onUpdate(onChange);
        },
        count: conn => conn.db.allSteloTransfer.count(),
    },
    all_stelo_wallet: {
        query: tables.allSteloWallet,
        listen: (conn, onChange) => {
            conn.db.allSteloWallet.onInsert(onChange);
            conn.db.allSteloWallet.onDelete(onChange);
            conn.db.allSteloWallet.onUpdate(onChange);
        },
        count: conn => conn.db.allSteloWallet.count(),
    },
    all_stelo_receiving_wallet: {
        query: tables.allSteloReceivingWallet,
        listen: (conn, onChange) => {
            conn.db.allSteloReceivingWallet.onInsert(onChange);
            conn.db.allSteloReceivingWallet.onDelete(onChange);
            conn.db.allSteloReceivingWallet.onUpdate(onChange);
        },
        count: conn => conn.db.allSteloReceivingWallet.count(),
    },
    all_integration_link_request: {
        query: tables.allIntegrationLinkRequest,
        listen: (conn, onChange) => {
            conn.db.allIntegrationLinkRequest.onInsert(onChange);
            conn.db.allIntegrationLinkRequest.onDelete(onChange);
            conn.db.allIntegrationLinkRequest.onUpdate(onChange);
        },
        count: conn => conn.db.allIntegrationLinkRequest.count(),
    },
    all_craft_bounty_funding: {
        query: tables.allCraftBountyFunding,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyFunding.onInsert(onChange);
            conn.db.allCraftBountyFunding.onDelete(onChange);
            conn.db.allCraftBountyFunding.onUpdate(onChange);
        },
        count: conn => conn.db.allCraftBountyFunding.count(),
    },
    all_stelo_wallet_status: {
        query: tables.allSteloWalletStatus,
        listen: (conn, onChange) => {
            conn.db.allSteloWalletStatus.onInsert(onChange);
            conn.db.allSteloWalletStatus.onDelete(onChange);
            conn.db.allSteloWalletStatus.onUpdate(onChange);
        },
        count: conn => conn.db.allSteloWalletStatus.count(),
    },
    all_funding_notify_trigger: {
        query: tables.allFundingNotifyTrigger,
        listen: (conn, onChange) => {
            conn.db.allFundingNotifyTrigger.onInsert(onChange);
            conn.db.allFundingNotifyTrigger.onDelete(onChange);
            conn.db.allFundingNotifyTrigger.onUpdate(onChange);
        },
        count: conn => conn.db.allFundingNotifyTrigger.count(),
    },
    all_discord_funding_notify_target: {
        query: tables.allDiscordFundingNotifyTarget,
        listen: (conn, onChange) => {
            conn.db.allDiscordFundingNotifyTarget.onInsert(onChange);
            conn.db.allDiscordFundingNotifyTarget.onDelete(onChange);
            conn.db.allDiscordFundingNotifyTarget.onUpdate(onChange);
        },
        count: conn => conn.db.allDiscordFundingNotifyTarget.count(),
    },
    stelo_currency_policy: {
        query: tables.steloCurrencyPolicy,
        listen: (conn, onChange) => {
            conn.db.steloCurrencyPolicy.onInsert(onChange);
            conn.db.steloCurrencyPolicy.onDelete(onChange);
            conn.db.steloCurrencyPolicy.onUpdate(onChange);
        },
        count: conn => conn.db.steloCurrencyPolicy.count(),
    },
    stelo_payout_schedule: {
        query: tables.steloPayoutSchedule,
        listen: (conn, onChange) => {
            conn.db.steloPayoutSchedule.onInsert(onChange);
            conn.db.steloPayoutSchedule.onDelete(onChange);
            conn.db.steloPayoutSchedule.onUpdate(onChange);
        },
        count: conn => conn.db.steloPayoutSchedule.count(),
    },
};

export interface BricoAppConnection {
    readonly connection: SupervisedConnection<DbConnection> | null;
    /** Why the connection is not running, or `null` when it is. */
    readonly disabledReason: string | null;
    readonly isLive: boolean;
    /** Hex identity this connection authenticated as — what `register_service_principal` needs. */
    readonly identityHex: string | null;
    stop(): void;
}

export interface BricoAppOptions extends SupervisorOptions {
    /** `null` when `BRICO_APP_ENABLED` is off. */
    target: SpacetimeTarget | null;
    /** Called whenever the module's rows change, so the watch source re-reads on the next snapshot. */
    onRowsChanged(): void;
    /** Mirror of the bounty tables: fed from row callbacks, and replaced by a full read each time the initial subscription applies. */
    cache: AppCache;
    /** Mirror of the escrow, transfer-intent and Stelo wallet tables, fed the same way as `cache`. */
    escrow: EscrowCache;
    /** How often to compare the cache against a full table read, adopting the full read on drift. 0 disables. */
    reconcileIntervalMs: number;
    /** Called each time the initial subscription is applied (including after a reconnect), not on row changes. */
    onReady?(): void;
}

export function startBricoAppConnection(options: BricoAppOptions): BricoAppConnection {
    const log: Logger = options.log.child("app");
    const {target} = options;

    if (!target) {
        return {
            connection: null,
            disabledReason: "BRICO_APP_ENABLED is not set — set it (and BRICO_APP_HOST) to bring up the brico-app half of the bridge",
            isLive: false,
            identityHex: null,
            stop: () => {},
        };
    }

    let identityHex: string | null = null;
    let current: DbConnection | null = null;
    const {cache, escrow} = options;

    const connection = createSupervisedConnection<DbConnection>(
        {
            label: target.label,
            uri: target.uri,
            database: target.database,
            dial: handlers =>
                DbConnection.builder()
                    .withUri(target.uri)
                    .withDatabaseName(target.database)
                    .withToken(handlers.token)
                    .onConnect((conn, identity, token) => {
                        identityHex = identity.toHexString();
                        handlers.onConnect(conn, identity, token);
                    })
                    .onDisconnect((_ctx, error) => handlers.onDisconnect(error))
                    .onConnectError((_ctx, error) => handlers.onConnectError(error))
                    .build(),
            onConnected: (conn, ctx) => {
                const tables = Object.keys(APP_TABLES);
                for (const name of tables) APP_TABLES[name].listen(conn, options.onRowsChanged);

                current = conn;
                // Rows delivered with the initial subscription are covered by the full read at
                // `onApplied`, so only later transactions reach the cache.
                let loaded = false;
                const accepts = (callbackCtx: {event: {tag: string}}) => loaded && callbackCtx.event.tag !== "SubscribeApplied";
                attachFeed(conn.db.allLinkedIntegration, cache.linkedIntegration, accepts);
                attachFeed(conn.db.allBountyRule, cache.bountyRule, accepts);
                attachFeed(conn.db.allCraftBountyOverride, cache.craftBountyOverride, accepts);
                attachFeed(conn.db.allCraftBountyAssignment, cache.craftBountyAssignment, accepts);
                attachFeed(conn.db.allPrivateCraftBountyAssignment, cache.privateCraftBountyAssignment, accepts);
                attachFeed(conn.db.allCraftBountyEntitlement, cache.craftBountyEntitlement, accepts);
                attachFeed(conn.db.allLoyaltyReward, cache.loyaltyReward, accepts);
                attachFeed(conn.db.allLoyaltyRule, cache.loyaltyRule, accepts);
                attachFeed(conn.db.allLoyaltyBonusTotal, cache.loyaltyBonusTotal, accepts);
                attachFeed(conn.db.allBountyEntitlementTotal, cache.bountyEntitlementTotal, accepts);
                attachFeed(conn.db.allCraftBountyEscrow, escrow.craftBountyEscrow, accepts);
                attachFeed(conn.db.allBountyEscrowWallet, escrow.escrowWallet, accepts);
                attachFeed(conn.db.allBountyEscrowPool, escrow.escrowPool, accepts);
                attachFeed(conn.db.allBountyEscrowJournal, escrow.escrowJournal, accepts);
                attachFeed(conn.db.allSteloTransfer, escrow.steloTransfer, accepts);
                attachFeed(conn.db.allLinkedIntegration, escrow.linkedIntegration, accepts);
                attachFeed(conn.db.allSteloWallet, escrow.steloWallet, accepts);
                attachFeed(conn.db.allSteloReceivingWallet, escrow.steloReceivingWallet, accepts);
                attachFeed(conn.db.allIntegrationLinkRequest, escrow.integrationLinkRequest, accepts);
                attachFeed(conn.db.allCraftBountyFunding, escrow.craftBountyFunding, accepts);
                attachFeed(conn.db.allSteloWalletStatus, escrow.steloWalletStatus, accepts);
                attachFeed(conn.db.allFundingNotifyTrigger, escrow.fundingNotifyTrigger, accepts);
                attachFeed(conn.db.allDiscordFundingNotifyTarget, escrow.discordFundingNotifyTarget, accepts);
                attachFeed(conn.db.steloCurrencyPolicy, escrow.currencyPolicy, accepts);
                attachFeed(conn.db.steloPayoutSchedule, escrow.payoutSchedule, accepts);

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
                        cache.load(conn);
                        escrow.load(conn);
                        loaded = true;
                        ctx.setLive();
                        options.onRowsChanged();
                        options.onReady?.();
                        const counts = tables.map(name => `${name}=${APP_TABLES[name].count(conn)}`).join(" ");
                        log.info("initial subscription applied", {identity: identityHex ?? "?", rows: counts});
                        if (tables.every(name => APP_TABLES[name].count(conn) === 0n)) {
                            // Almost always the authorization case rather than an empty database:
                            // the `all_*` views return nothing to an unregistered identity.
                            log.warn(
                                "every subscribed view is empty — if this identity is not in service_principal that is expected; " +
                                    `register it with: spacetime call ${target.database} register_service_principal '"${identityHex ?? "<identity>"}"' '"brico-bot"'`,
                            );
                        }
                    })
                    .onError(errorCtx => {
                        ctx.setError(`subscription error: ${errorCtx.event ? String(errorCtx.event) : "unknown"}`);
                    })
                    .subscribe(Object.values(APP_TABLES).map(t => t.query));

                return () => {
                    loaded = false;
                    subscription?.unsubscribe();
                    subscription = null;
                    if (current === conn) current = null;
                };
            },
        },
        {tokens: options.tokens, log: options.log, delayMs: options.delayMs, maxDelayMs: options.maxDelayMs},
    );

    connection.start();

    const reconcileTimer = options.reconcileIntervalMs > 0
        ? setInterval(() => {
            if (!current?.isActive || !connection.isLive) return;
            const stop = startStep("reconcile");
            const drift = findAppDrift(cache, current);
            if (drift) {
                appDriftTotal.inc();
                log.error("app cache drifted from the brico-app tables; adopting a full read", {tables: drift});
                cache.load(current);
                options.onRowsChanged();
            }
            stop();
        }, options.reconcileIntervalMs)
        : null;
    reconcileTimer?.unref();

    return {
        connection,
        disabledReason: null,
        get isLive() {
            return connection.isLive;
        },
        get identityHex() {
            return identityHex;
        },
        stop: () => {
            if (reconcileTimer) clearInterval(reconcileTimer);
            connection.stop();
        },
    };
}
