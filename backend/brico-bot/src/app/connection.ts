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
    count(conn: DbConnection): number;
}

/**
 * Tables/views the bridge knows how to subscribe to on `brico-app`, keyed by SQL name.
 *
 * `all_saved_craft_filter`/`all_craft_filter_watch` are the tables the bridge reads its filters
 * from; the real join lives in `watch-source.ts`'s `createAccountWatchSource`.
 */
const APP_TABLES: Record<string, AppTable> = {
    all_account: {
        query: tables.allAccount,
        listen: (conn, onChange) => {
            conn.db.allAccount.onInsert(onChange);
            conn.db.allAccount.onDelete(onChange);
            conn.db.allAccount.onUpdate(onChange);
        },
        count: conn => [...conn.db.allAccount.iter()].length,
    },
    all_linked_integration: {
        query: tables.allLinkedIntegration,
        listen: (conn, onChange) => {
            conn.db.allLinkedIntegration.onInsert(onChange);
            conn.db.allLinkedIntegration.onDelete(onChange);
            conn.db.allLinkedIntegration.onUpdate(onChange);
        },
        count: conn => [...conn.db.allLinkedIntegration.iter()].length,
    },
    all_saved_craft_filter: {
        query: tables.allSavedCraftFilter,
        listen: (conn, onChange) => {
            conn.db.allSavedCraftFilter.onInsert(onChange);
            conn.db.allSavedCraftFilter.onDelete(onChange);
            conn.db.allSavedCraftFilter.onUpdate(onChange);
        },
        count: conn => [...conn.db.allSavedCraftFilter.iter()].length,
    },
    all_craft_filter_watch: {
        query: tables.allCraftFilterWatch,
        listen: (conn, onChange) => {
            conn.db.allCraftFilterWatch.onInsert(onChange);
            conn.db.allCraftFilterWatch.onDelete(onChange);
            conn.db.allCraftFilterWatch.onUpdate(onChange);
        },
        count: conn => [...conn.db.allCraftFilterWatch.iter()].length,
    },
    all_bounty_rule: {
        query: tables.allBountyRule,
        listen: (conn, onChange) => {
            conn.db.allBountyRule.onInsert(onChange);
            conn.db.allBountyRule.onDelete(onChange);
            conn.db.allBountyRule.onUpdate(onChange);
        },
        count: conn => [...conn.db.allBountyRule.iter()].length,
    },
    all_craft_bounty_override: {
        query: tables.allCraftBountyOverride,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyOverride.onInsert(onChange);
            conn.db.allCraftBountyOverride.onDelete(onChange);
            conn.db.allCraftBountyOverride.onUpdate(onChange);
        },
        count: conn => [...conn.db.allCraftBountyOverride.iter()].length,
    },
    all_craft_bounty_assignment: {
        query: tables.allCraftBountyAssignment,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyAssignment.onInsert(onChange);
            conn.db.allCraftBountyAssignment.onDelete(onChange);
            conn.db.allCraftBountyAssignment.onUpdate(onChange);
        },
        count: conn => [...conn.db.allCraftBountyAssignment.iter()].length,
    },
    all_private_craft_bounty_assignment: {
        query: tables.allPrivateCraftBountyAssignment,
        listen: (conn, onChange) => {
            conn.db.allPrivateCraftBountyAssignment.onInsert(onChange);
            conn.db.allPrivateCraftBountyAssignment.onDelete(onChange);
            conn.db.allPrivateCraftBountyAssignment.onUpdate(onChange);
        },
        count: conn => [...conn.db.allPrivateCraftBountyAssignment.iter()].length,
    },
    all_craft_bounty_entitlement: {
        query: tables.allCraftBountyEntitlement,
        listen: (conn, onChange) => {
            conn.db.allCraftBountyEntitlement.onInsert(onChange);
            conn.db.allCraftBountyEntitlement.onDelete(onChange);
            conn.db.allCraftBountyEntitlement.onUpdate(onChange);
        },
        count: conn => [...conn.db.allCraftBountyEntitlement.iter()].length,
    },
    all_loyalty_reward: {
        query: tables.allLoyaltyReward,
        listen: (conn, onChange) => {
            conn.db.allLoyaltyReward.onInsert(onChange);
            conn.db.allLoyaltyReward.onDelete(onChange);
            conn.db.allLoyaltyReward.onUpdate(onChange);
        },
        count: conn => [...conn.db.allLoyaltyReward.iter()].length,
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

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
                        ctx.setLive();
                        options.onRowsChanged();
                        const counts = tables.map(name => `${name}=${APP_TABLES[name].count(conn)}`).join(" ");
                        log.info("initial subscription applied", {identity: identityHex ?? "?", rows: counts});
                        if (tables.every(name => APP_TABLES[name].count(conn) === 0)) {
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
