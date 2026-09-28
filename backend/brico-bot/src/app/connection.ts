/**
 * connection.ts — the bridge's *second* SpacetimeDB connection, to brico's own `brico-app` module.
 */
import {DbConnection, type SubscriptionHandle, tables} from "@brico/bindings/brico-app";
import type {RowTypedQuery} from "spacetimedb";

import type {SpacetimeTarget} from "../config.ts";
import type {Logger} from "../log.ts";
import {createSupervisedConnection, type SupervisedConnection, type SupervisorOptions} from "../spacetime/connection.ts";

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
    /**
     * Called specifically when `all_loyalty_rule` or `all_loyalty_reward` changes (a payer added,
     * edited, or deleted a manual reward or automated rule) — narrower than `onRowsChanged`, which
     * fires for any `brico-app` table. Lets `BountyEngine` mark its loyalty-bonus resync pending
     * without re-running it for unrelated changes (a saved filter edit, a notification setting).
     */
    onLoyaltyRulesChanged(): void;
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

                // Narrower than the loop above: only these two tables' changes should mark a
                // loyalty-bonus resync pending, not every `brico-app` change.
                conn.db.allLoyaltyRule.onInsert(options.onLoyaltyRulesChanged);
                conn.db.allLoyaltyRule.onDelete(options.onLoyaltyRulesChanged);
                conn.db.allLoyaltyRule.onUpdate(options.onLoyaltyRulesChanged);
                conn.db.allLoyaltyReward.onInsert(options.onLoyaltyRulesChanged);
                conn.db.allLoyaltyReward.onDelete(options.onLoyaltyRulesChanged);
                conn.db.allLoyaltyReward.onUpdate(options.onLoyaltyRulesChanged);

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
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
                    subscription?.unsubscribe();
                    subscription = null;
                };
            },
        },
        {tokens: options.tokens, log: options.log, delayMs: options.delayMs, maxDelayMs: options.maxDelayMs},
    );

    connection.start();

    return {
        connection,
        disabledReason: null,
        get isLive() {
            return connection.isLive;
        },
        get identityHex() {
            return identityHex;
        },
        stop: () => connection.stop(),
    };
}
