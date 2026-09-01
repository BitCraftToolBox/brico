/**
 * manager.tsx — the app-wide registry of SpacetimeDB connections.
 *
 * `connection.ts` can hold a connection open indefinitely, but something has to decide *when*, and
 * a page cannot: a route transition disposes the page that owned the socket a frame before the
 * next page asks for the same rows. The manager is that decider. It is provided once near the
 * route root (`ConnectionManagerProvider` in `app.tsx`), so it outlives every route, and it keys
 * connections by (server URI, module name) — one socket per database, however many pages want it.
 *
 * Two levels of reference counting, both with the same grace period:
 * - **per resource**: two pages asking for `crafts:reference` share one subscription, and it is
 *   unsubscribed only after the last of them lets go.
 * - **per connection**: the `DbConnection` is torn down only after the last resource on it is
 *   gone.
 *
 * The grace timeout is the whole point. Browsing `/tools/crafts/browse` → a craft → back is three
 * mount/unmount pairs in a couple of seconds; without it each one would pay a fresh WebSocket
 * handshake plus a full re-subscribe of every reference table. With it, the release is *scheduled*,
 * and the next request cancels it — the socket never notices the navigation happened.
 *
 * Nothing here mentions an SDK: it composes `createSpacetimeConnection`, which talks to whichever
 * `SdkAdapter` its `ServerDescriptor` carries. A 1.x BitCraft relay would be another descriptor,
 * not another manager.
 */
import {type Accessor, createContext, createSignal, getOwner, type JSX, onCleanup, useContext} from "solid-js";
import type {ConnectionStatus, ResourceHandle, ResourceSpec, ServerDescriptor, SpacetimeConnection} from "~/lib/spacetime/connection";
import {connectionKey, createSpacetimeConnection} from "~/lib/spacetime/connection";

/**
 * How long a released resource (or an idle connection) is kept before it is actually dropped.
 *
 * Sized for human navigation rather than for a frame: long enough that reading a craft's detail
 * page and going back costs nothing, short enough that a tab left on an unrelated page is not
 * holding a subscription to every craft in the game a minute later.
 */
const DEFAULT_GRACE_MS = 20_000;

/** A live claim on a resource. Released automatically when the owning computation is disposed. */
export interface ResourceRequest {
    /** True once the resource's rows are in the client cache. */
    ready: Accessor<boolean>;
    /** Idempotent. Starts the grace timer if this was the last claim. */
    release: () => void;
}

/** The manager's view of one connection, handed to whoever asked for it. */
export interface ManagedConnection<TConnection, TQuery> {
    status: Accessor<ConnectionStatus>;
    error: Accessor<string | null>;
    /** The live connection while the socket is up, else `null`. */
    active: Accessor<TConnection | null>;
    /** Drop the socket and dial again immediately — for a "Reconnect" button. */
    reconnect: () => void;
    /**
     * Drops the socket without dialing again — for a caller whose own base claim (see
     * `connection()` below) would otherwise keep this connection's ref count above zero forever,
     * masking the fact that nothing actually wants it open anymore (`AccountProvider` on logout:
     * its bare `useConnection` hold never unwinds via ref-counting, since it lives for the app's
     * whole session, so it has to close the socket itself instead of waiting for the last resource
     * release to bring `entry.refs` to zero). Registered resources survive it and reattach on the
     * next `open()`/`reconnect()`, same as `SpacetimeConnection.close()`.
     */
    close: () => void;
    /** Seeds the credential a later dial will use — see `SpacetimeConnection.primeToken`. */
    primeToken: (token: string) => void;
    /** Forgets the seeded credential — see `SpacetimeConnection.clearToken`. */
    clearToken: () => void;
    /**
     * Declares that the caller needs `spec`'s tables subscribed, joining an existing subscription
     * if another caller already asked for the same `spec.key`.
     *
     * `onChange` fires on any row change in those tables and once when the subscription applies.
     * It is per-requester, so two pages sharing a resource each get their own callback — coalesce
     * it yourself; the SDK delivers one call per row.
     */
    requestResource: (spec: ResourceSpec<TQuery>, onChange?: () => void) => ResourceRequest;
}

/** One resource's held state, as a diagnostics view would show it. */
export interface ResourceSnapshot {
    key: string;
    /** Live requesters sharing this subscription. */
    requests: number;
    ready: boolean;
}

/** One connection's held state, as a diagnostics view would show it. */
export interface ConnectionSnapshot {
    key: string;
    uri: string;
    module: string;
    status: ConnectionStatus;
    error: string | null;
    /** Live holds on this connection: resource requests plus bare `connection()` claims. */
    requests: number;
    resources: ResourceSnapshot[];
}

export interface ConnectionManager {
    /**
     * The connection for `server`, creating and dialing it if this is the first caller.
     *
     * Registers a claim of its own on the current owner, so simply holding the returned object
     * keeps the socket up even before any resource is requested (and lets it go on unmount).
     */
    connection: <TConnection, TQuery>(server: ServerDescriptor<TConnection, TQuery>) => ManagedConnection<TConnection, TQuery>;
    /** Closes every connection immediately, ignoring grace. For the provider's own teardown. */
    dispose: () => void;
    /** Every live connection and what it's holding — for a status indicator, not for driving logic. */
    snapshot: Accessor<ConnectionSnapshot[]>;
}

interface ManagedResource {
    /** The connection-level registration, shared by every requester of this key. */
    handle: ResourceHandle;
    /** One callback per requester. */
    listeners: Set<() => void>;
    refs: number;
    graceTimer: ReturnType<typeof setTimeout> | null;
}

interface ConnectionEntry {
    connection: SpacetimeConnection<unknown, unknown>;
    resources: Map<string, ManagedResource>;
    /** Resource claims plus `connection()` holds — everything keeping this socket alive. */
    refs: number;
    graceTimer: ReturnType<typeof setTimeout> | null;
}

function clearTimer(owner: {graceTimer: ReturnType<typeof setTimeout> | null}) {
    if (owner.graceTimer !== null) {
        clearTimeout(owner.graceTimer);
        owner.graceTimer = null;
    }
}

/**
 * Ties `release` to the disposal of whatever computation is running.
 *
 * Requests made outside an owner (from a timer, say) get no automatic release and must call
 * `release()` themselves — registering `onCleanup` there would either warn or attach the claim to
 * the wrong lifetime.
 */
function releaseOnCleanup(release: () => void) {
    if (getOwner()) onCleanup(release);
}

export function createConnectionManager(graceMs: number = DEFAULT_GRACE_MS): ConnectionManager {
    const entries = new Map<string, ConnectionEntry>();

    // `entries` and its ref counts are plain mutable state, not signals — bumping this on every
    // structural change (entry/resource added or removed, ref count changed) is what lets
    // `snapshot()` be reactive without turning every `refs += 1` above into a signal write.
    const [version, bumpVersion] = createSignal(0);
    const bump = () => bumpVersion(v => v + 1);

    function entryFor<TConnection, TQuery>(server: ServerDescriptor<TConnection, TQuery>): ConnectionEntry {
        const key = connectionKey(server);
        const existing = entries.get(key);
        if (existing) {
            clearTimer(existing);
            return existing;
        }
        const entry: ConnectionEntry = {
            connection: createSpacetimeConnection(server) as SpacetimeConnection<unknown, unknown>,
            resources: new Map(),
            refs: 0,
            graceTimer: null,
        };
        entries.set(key, entry);
        bump();
        return entry;
    }

    /** Drops everything on a connection and forgets it. Called by the idle timer and `dispose`. */
    function shutdown(key: string, entry: ConnectionEntry) {
        clearTimer(entry);
        for (const resource of entry.resources.values()) {
            clearTimer(resource);
            resource.handle.release();
        }
        entry.resources.clear();
        entry.connection.close();
        entries.delete(key);
        bump();
    }

    /** One claim let go. Schedules teardown if it was the last, cancelling nothing if it wasn't. */
    function unhold(key: string, entry: ConnectionEntry) {
        entry.refs -= 1;
        bump();
        if (entry.refs > 0 || entries.get(key) !== entry) return;
        clearTimer(entry);
        entry.graceTimer = setTimeout(() => {
            entry.graceTimer = null;
            // A request that arrived during the grace window already cancelled this timer, so
            // reaching here means nothing wants the socket.
            if (entry.refs === 0 && entries.get(key) === entry) shutdown(key, entry);
        }, graceMs);
    }

    function requestResource<TQuery>(key: string, entry: ConnectionEntry, spec: ResourceSpec<TQuery>, onChange?: () => void): ResourceRequest {
        clearTimer(entry);
        entry.refs += 1;

        let resource = entry.resources.get(spec.key);
        if (resource) {
            clearTimer(resource);
        } else {
            const listeners = new Set<() => void>();
            const handle = entry.connection.addResource(
                spec as ResourceSpec<unknown>,
                // Fan out to every requester. Copied on iteration is unnecessary: a listener that
                // releases mid-notify has already been removed from a Set we are iterating, which
                // JS handles by skipping it.
                () => {
                    for (const listener of listeners) listener();
                },
            );
            resource = {handle, listeners, refs: 0, graceTimer: null};
            entry.resources.set(spec.key, resource);
        }

        const claimed = resource;
        claimed.refs += 1;
        bump();
        if (onChange) claimed.listeners.add(onChange);
        entry.connection.open();

        let released = false;

        // A resource that is already applied — the common case when a route transition rejoins one
        // inside its grace window — will not fire `onApplied` again for this late joiner. Without
        // a nudge it would sit on stale (or empty) state until some row in those tables happened
        // to change, which for a slow table is indefinitely. Deferred by a microtask so a caller
        // requesting during render or an effect is not re-entered mid-setup.
        if (onChange && claimed.handle.ready()) {
            queueMicrotask(() => {
                if (!released) onChange();
            });
        }

        const release = () => {
            if (released) return;
            released = true;
            if (onChange) claimed.listeners.delete(onChange);
            claimed.refs -= 1;
            bump();
            if (claimed.refs === 0 && entry.resources.get(spec.key) === claimed) {
                clearTimer(claimed);
                claimed.graceTimer = setTimeout(() => {
                    claimed.graceTimer = null;
                    if (claimed.refs > 0 || entry.resources.get(spec.key) !== claimed) return;
                    claimed.handle.release();
                    entry.resources.delete(spec.key);
                    bump();
                }, graceMs);
            }
            unhold(key, entry);
        };

        releaseOnCleanup(release);
        return {ready: claimed.handle.ready, release};
    }

    return {
        connection<TConnection, TQuery>(server: ServerDescriptor<TConnection, TQuery>): ManagedConnection<TConnection, TQuery> {
            const key = connectionKey(server);
            const entry = entryFor(server);
            const connection = entry.connection as SpacetimeConnection<TConnection, TQuery>;

            // Holding the handle is itself a claim, so a page can render `status()` before it has
            // requested anything and still keep the socket from being torn down under it.
            entry.refs += 1;
            bump();
            let released = false;
            releaseOnCleanup(() => {
                if (released) return;
                released = true;
                unhold(key, entry);
            });

            return {
                status: connection.status,
                error: connection.error,
                active: connection.active,
                reconnect: connection.reconnect,
                close: connection.close,
                primeToken: connection.primeToken,
                clearToken: connection.clearToken,
                requestResource: (spec, onChange) => requestResource(key, entry, spec, onChange),
            };
        },
        dispose() {
            for (const [key, entry] of [...entries]) shutdown(key, entry);
        },
        snapshot(): ConnectionSnapshot[] {
            // Reading each connection's own `status`/`error` signals (rather than caching them at
            // `bump()` time) means a status flip alone re-runs this without needing its own bump.
            version();
            return [...entries].map(([key, entry]) => ({
                key,
                uri: entry.connection.server.uri,
                module: entry.connection.server.module,
                status: entry.connection.status(),
                error: entry.connection.error(),
                requests: entry.refs,
                resources: [...entry.resources].map(([resourceKey, resource]) => ({
                    key: resourceKey,
                    requests: resource.refs,
                    ready: resource.handle.ready(),
                })),
            }));
        },
    };
}

const ConnectionManagerContext = createContext<ConnectionManager>();

/**
 * Mount once, above the router's routes — see `app.tsx`. Mounting it per route would defeat the
 * point: the registry has to survive the transition that releases the last claim.
 */
export function ConnectionManagerProvider(props: {children: JSX.Element; graceMs?: number}) {
    const manager = createConnectionManager(props.graceMs);
    onCleanup(() => manager.dispose());
    return <ConnectionManagerContext.Provider value={manager}>{props.children}</ConnectionManagerContext.Provider>;
}

export function useConnectionManager(): ConnectionManager {
    const manager = useContext(ConnectionManagerContext);
    if (!manager) throw new Error("useConnectionManager: no ConnectionManagerProvider above this component.");
    return manager;
}

/**
 * The managed connection to `server`, claimed for the lifetime of the calling component.
 *
 * Must be called during render (it registers an `onCleanup`). Safe under SSR: the registry entry
 * is created but `createSpacetimeConnection` never dials on the server.
 */
export function useConnection<TConnection, TQuery>(
    server: ServerDescriptor<TConnection, TQuery>,
): ManagedConnection<TConnection, TQuery> {
    return useConnectionManager().connection(server);
}
