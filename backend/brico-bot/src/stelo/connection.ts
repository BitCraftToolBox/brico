/**
 * connection.ts — the bot's third SpacetimeDB connection, to Stelo, where escrowed bounty money
 * lives. The only reducer it calls is `create_transfer`.
 */
import {DbConnection, type SubscriptionHandle, tables} from "@brico/bindings/stelo";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import {createSupervisedConnection, type SupervisedConnection, type SupervisorOptions} from "../spacetime/connection.ts";
import {attachFeed} from "../spacetime/feed.ts";
import type {SteloAuth} from "./auth.ts";
import type {SteloCache} from "./stelo-cache.ts";

/** The SDK types a procedure `Result` as `Ok | Err` but deserializes it as `{ok}` or `{err}`; this reads it as the latter. */
function unwrapResult<Ok>(result: unknown): {ok: Ok; err?: undefined} | {ok?: undefined; err: string} {
    return result as {ok: Ok} | {err: string};
}

export interface SteloConnection {
    readonly connection: SupervisedConnection<DbConnection> | null;
    readonly isLive: boolean;
    /** Hex identity this connection authenticated as; Stelo's `create_app_ticket` / the dev seed need it. */
    readonly identityHex: string | null;
    /** Sends one transfer (`pending = false`, memo and idempotency key both `ref`) and resolves when the reducer commits. */
    createTransfer(args: {fromAccountId: bigint; toAccountId: bigint; steloAmount: bigint; ref: string}): Promise<void>;
    /** Accounts on one ledger whose address starts with `address`, from Stelo's public directory (no membership needed). */
    searchAddress(address: string, ledgerId: bigint): Promise<SteloDirectoryHit[]>;
    /** Up to 10 accounts on one ledger whose address or primary-user name starts with `term`; `scope` limits it to usernames or addresses. */
    searchAccounts(term: string, ledgerId: bigint, scope?: "Username" | "Address"): Promise<SteloDirectoryHit[]>;
    /** One account's public directory entry, or `undefined` if it does not exist. */
    lookupAccount(accountId: bigint): Promise<SteloDirectoryHit | undefined>;
    stop(): void;
}

/** An account as Stelo's public directory shows it. */
export interface SteloDirectoryHit {
    accountId: bigint;
    address: string;
    ledgerId: bigint;
    kind: {tag: string};
    primaryUsername: string | undefined;
}

export interface SteloConnectionOptions extends Omit<SupervisorOptions, "tokens"> {
    config: SteloConfig;
    /** Supplies the dial token and is told about connect outcomes. */
    auth: SteloAuth;
    cache: SteloCache;
    /** Called whenever Stelo's rows change, so the Stelo step re-runs. */
    onRowsChanged(): void;
}

export function startSteloConnection(options: SteloConnectionOptions): SteloConnection {
    const log: Logger = options.log.child("stelo");
    const {target} = options.config;
    const {cache} = options;
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
                        options.auth.noteConnected();
                        handlers.onConnect(conn, identity, token);
                    })
                    .onDisconnect((_ctx, error) => handlers.onDisconnect(error))
                    .onConnectError((_ctx, error) => {
                        options.auth.noteConnectError(error);
                        handlers.onConnectError(error);
                    })
                    .build(),
            onConnected: (conn, ctx) => {
                let loaded = false;
                const accepts = (callbackCtx: {event: {tag: string}}) => loaded && callbackCtx.event.tag !== "SubscribeApplied";
                const changed = options.onRowsChanged;
                attachFeed(conn.db.myAccounts, cache.accounts, accepts, changed);
                attachFeed(conn.db.myAccountsMembers, cache.members, accepts, changed);
                attachFeed(conn.db.myTransfers, cache.transferRows, accepts, changed);
                attachFeed(conn.db.user, cache.users, accepts, changed);
                attachFeed(conn.db.ledger, cache.ledgers, accepts, changed);

                let subscription: SubscriptionHandle | null = conn
                    .subscriptionBuilder()
                    .onApplied(() => {
                        if (!ctx.isCurrent()) return;
                        cache.load(conn);
                        loaded = true;
                        ctx.setLive();
                        changed();
                        log.info("initial subscription applied", {
                            identity: identityHex ?? "?",
                            accounts: conn.db.myAccounts.count().toString(),
                            transfers: conn.db.myTransfers.count().toString(),
                        });
                    })
                    .onError(errorCtx => {
                        ctx.setError(`subscription error: ${errorCtx.event ? String(errorCtx.event) : "unknown"}`);
                    })
                    .subscribe([tables.myAccounts, tables.myAccountsMembers, tables.myTransfers, tables.user, tables.ledger]);

                return () => {
                    loaded = false;
                    subscription?.unsubscribe();
                    subscription = null;
                };
            },
        },
        {tokens: options.auth.tokens, log: options.log, delayMs: options.delayMs, maxDelayMs: options.maxDelayMs},
    );

    connection.start();

    async function searchAccounts(term: string, ledgerId: bigint, scope?: "Username" | "Address"): Promise<SteloDirectoryHit[]> {
        const conn = connection.connection;
        if (!conn?.isActive || !connection.isLive) throw new Error("unavailable: stelo connection is not live");
        const result = unwrapResult<SteloDirectoryHit[]>(await conn.procedures.accountSearch({term, ledgerId, scope: scope && {tag: scope}}));
        if (result.err !== undefined) throw new Error(result.err);
        return result.ok;
    }

    return {
        connection,
        get isLive() {
            return connection.isLive;
        },
        get identityHex() {
            return identityHex;
        },
        async createTransfer({fromAccountId, toAccountId, steloAmount, ref}) {
            const conn = connection.connection;
            if (!conn?.isActive || !connection.isLive) throw new Error("unavailable: stelo connection is not live");
            await conn.reducers.createTransfer({
                sendingAccountId: fromAccountId,
                receivingAccountId: toAccountId,
                amount: steloAmount,
                memo: ref,
                idempotencyKey: ref,
                pending: false,
            });
        },
        searchAddress: (address, ledgerId) => searchAccounts(address, ledgerId, "Address"),
        searchAccounts,
        async lookupAccount(accountId) {
            const conn = connection.connection;
            if (!conn?.isActive || !connection.isLive) throw new Error("unavailable: stelo connection is not live");
            const result = unwrapResult<SteloDirectoryHit>(await conn.procedures.accountLookup({accountId}));
            if (result.err !== undefined) {
                if (result.err === "account not found") return undefined;
                throw new Error(result.err);
            }
            return result.ok;
        },
        stop: () => connection.stop(),
    };
}
