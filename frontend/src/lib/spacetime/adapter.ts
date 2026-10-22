/**
 * adapter.ts — the seam between the generic connection layer and one set of bindings + SpacetimeDB TS SDK.
 *
 * Only one live-capable connection exists in the repo today: `spacetimedb@2.x`, owned by `@brico/bindings`.
 * This layer stays generic over `TConnection`/`TQuery` rather than hardcoding one binding's types,
 * so additional adapters (a different SDK major, or a live `@brico/bitcraft-bindings` connection)
 * is a new file plus a `ServerDescriptor`, not a rewrite.
 */

/** Everything the generic layer hands an adapter to dial a connection. */
export interface AdapterOpenRequest<TConnection> {
    /** Base URI of the SpacetimeDB host. */
    uri: string;
    /** Module (database) name on that host. */
    module: string;
    /** Previously issued credentials, if any; the adapter must tolerate `undefined`. */
    token: string | undefined;
    /** Called once the connection is authenticated, with the (possibly new) token to persist. */
    onConnect: (connection: TConnection, token: string) => void;
    /** Called when an established connection drops, with a human-readable reason. */
    onDisconnect: (message: string) => void;
    /** Called when the initial dial fails, with a human-readable reason. */
    onConnectError: (message: string) => void;
}

/** Callbacks a subscription group reports through. */
export interface AdapterSubscriptionHandlers {
    /** The server has applied the queries and the initial rows are in the client cache. */
    onApplied: () => void;
    /** The queries were rejected, or an applied subscription was dropped. */
    onError: (message: string) => void;
}

/** An opaque, cancellable subscription group. */
export interface AdapterSubscription {
    unsubscribe: () => void;
}

/**
 * The per-SDK-major driver.
 *
 * @typeParam TConnection - the SDK's generated `DbConnection` type.
 * @typeParam TQuery - what that SDK's `subscribe` accepts for one query (a typed query object on
 *   2.x, a SQL string on 1.x).
 */
export interface SdkAdapter<TConnection, TQuery> {
    /** Diagnostic label, e.g. `"spacetimedb@2"`. Never branched on by the generic layer. */
    readonly sdk: string;
    /** Builds and dials a connection. Returns immediately; success arrives via `onConnect`. */
    open: (request: AdapterOpenRequest<TConnection>) => TConnection;
    /** Closes a connection. Must be safe to call on one that already dropped. */
    close: (connection: TConnection) => void;
    /** True while the socket is usable — guards reads of the client cache. */
    isActive: (connection: TConnection) => boolean;
    /** Subscribes to one group of queries. */
    subscribe: (
        connection: TConnection,
        queries: readonly TQuery[],
        handlers: AdapterSubscriptionHandlers,
    ) => AdapterSubscription;
    /**
     * Attaches row-change listeners to the named tables, calling `onChange` on any insert, delete
     * or update. The returned function detaches exactly the listeners it attached — the client
     * cache outlives a single subscription group, so leaking listeners would keep a released
     * resource's consumer alive.
     */
    watch: (connection: TConnection, tables: readonly string[], onChange: () => void) => () => void;
}
