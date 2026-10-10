/**
 * connection.ts — one managed SpacetimeDB connection, with no knowledge of what it carries.
 *
 * Extracted verbatim in behavior from the craft browser's `createCraftRelay`: token in
 * localStorage keyed by host+module, a redial on a **fixed** delay (`reconnectDelayMs`, 5 s — not
 * exponential backoff; `/tools/crafts/browse` has always run on the flat delay), and callbacks
 * guarded by a generation counter that retires an attempt the moment it fails — see `generation`
 * below, which is load-bearing for anyone who later does add backoff.
 * What it adds is that the *tables* are a parameter rather than a hardcoded list, and that they
 * arrive as one or more independently-releasable **resources** — a named group of queries that a
 * page declares it needs. That is what lets one connection serve several pages at once, and what
 * the connection manager (`manager.tsx`) reference-counts.
 *
 * Three deliberate non-features:
 * - **No Solid lifecycle.** Nothing here calls `onMount`/`onCleanup`, because the whole point is
 *   that a connection outlives the component that first asked for it. Owning `open()`/`close()` is
 *   the caller's job (a page's own lifecycle in the direct case, the manager's otherwise).
 * - **No SDK.** Everything version-specific goes through an `SdkAdapter` (see `adapter.ts`).
 * - **No dialing on the server.** `open()` returns immediately under SSR, so a bot render never
 *   opens a socket and never touches `localStorage`.
 */
import {type Accessor, createSignal} from "solid-js";
import {isServer} from "solid-js/web";
import type {SdkAdapter} from "~/lib/spacetime/adapter";

const DEFAULT_RECONNECT_DELAY_MS = 5000;

/**
 * Connection state, as a page would label it.
 *
 * `closed` is the initial value: `useConnection` creates and holds an entry the moment a caller
 * asks for it (see the manager's doc comment), which can happen well before — or without ever —
 * calling `open()` (`AccountProvider` holds the `brico-app` connection from mount but only opens
 * it once an OIDC session is confirmed). Defaulting to `connecting` here used to assume every
 * caller opens synchronously right after creating the connection, which is true for a resource
 * requested on mount but not for a caller gating `open()` on an async check. `open()`/`connect()`
 * flips this to `connecting` the moment a dial is actually attempted.
 */
export type ConnectionStatus = "connecting" | "syncing" | "live" | "error" | "closed";

/** Where a connection points and how to drive it. */
export interface ServerDescriptor<TConnection, TQuery> {
    /** Base URI of the SpacetimeDB host. */
    uri: string;
    /** Module (database) name on that host. */
    module: string;
    /** The SDK-major driver for this module's generated bindings. */
    adapter: SdkAdapter<TConnection, TQuery>;
    /**
     * localStorage namespace for the credentials this host issues. Part of the token key, so two
     * modules on the same host keep separate tokens and neither collides with another product's.
     */
    tokenNamespace: string;
    /** How long to wait before redialing a dropped connection. */
    reconnectDelayMs?: number;
}

/** One table a resource needs: its SQL name, plus the query that brings its rows in. */
export interface TableQuery<TQuery> {
    /** SQL/source table name — what row listeners are attached through. */
    table: string;
    /** The subscription query. Whole-table or narrowed; the adapter decides what it accepts. */
    query: TQuery;
}

/**
 * A named group of tables a consumer needs subscribed.
 *
 * `key` is the group's identity, not its description: two pages that want the same rows must pass
 * the same key so the manager can share one subscription between them, and a per-object resource
 * must fold its object's id into the key (`crafts:detail:1234`).
 */
export interface ResourceSpec<TQuery> {
    key: string;
    tables: readonly TableQuery<TQuery>[];
}

/** A live claim on a resource. Releasing it drops the subscription (see the manager for grace). */
export interface ResourceHandle {
    /** True once this group's rows are in the client cache. */
    ready: Accessor<boolean>;
    release: () => void;
}

export interface SpacetimeConnection<TConnection, TQuery> {
    readonly server: ServerDescriptor<TConnection, TQuery>;
    status: Accessor<ConnectionStatus>;
    /** Human-readable failure, or `null`. Cleared on a successful connect. */
    error: Accessor<string | null>;
    /**
     * The live connection while the socket is up, else `null`. Read it for a one-off cache scan
     * (that is what a resource's `onChange` does); read it in a computation to react to reconnects.
     */
    active: Accessor<TConnection | null>;
    /**
     * Registers a resource and, if already connected, subscribes to it right away. `onChange` runs
     * on any row change in the resource's tables and once when the subscription applies — coalesce
     * it yourself; the SDK delivers per-row callbacks.
     *
     * Registering a key that is already registered replaces it. Callers that share resources
     * between pages should go through the manager, which reference-counts instead.
     */
    addResource: (spec: ResourceSpec<TQuery>, onChange?: () => void) => ResourceHandle;
    /** Dials, unless already dialing/connected or running under SSR. Idempotent. */
    open: () => void;
    /** Drops the socket and stops reconnecting. Registered resources survive a later `open()`. */
    close: () => void;
    /** Drops the current socket and dials again immediately. */
    reconnect: () => void;
    /**
     * Overwrites the stored credential for this server without dialing. A caller that obtains a
     * token out-of-band (e.g. an OIDC login) seeds it here before the first `open()`/`reconnect()`
     * so that dial picks it up — generic, not specific to any one auth flow.
     */
    primeToken: (token: string) => void;
    /** Forgets the stored credential, so a later `open()` dials anonymously again. */
    clearToken: () => void;
}

/** localStorage key holding the credentials a host issued for one module. */
function tokenKeyFor(server: Pick<ServerDescriptor<never, never>, "uri" | "module" | "tokenNamespace">): string {
    return `${server.tokenNamespace}:${server.uri}/${server.module}/auth_token`;
}

/**
 * The registry key for a connection: one socket per (host, module) pair.
 *
 * Not the adapter — a module is served by exactly one SDK major, so including it could only ever
 * produce a second connection to the same database.
 */
export function connectionKey(server: Pick<ServerDescriptor<never, never>, "uri" | "module">): string {
    return `${server.uri}/${server.module}`;
}

/** localStorage can throw (Safari private mode, storage disabled); a token is never worth that. */
function readStored(key: string): string | undefined {
    try {
        return localStorage.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
}

function writeStored(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Not fatal: the next connect simply gets a fresh identity.
    }
}

function clearStored(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Not fatal: worst case a stale token is retried once more and fails again.
    }
}

interface ResourceState<TQuery> {
    spec: ResourceSpec<TQuery>;
    onChange?: () => void;
    subscription: {unsubscribe: () => void} | null;
    detachListeners: (() => void) | null;
    ready: Accessor<boolean>;
    setReady: (value: boolean) => void;
}

export function createSpacetimeConnection<TConnection, TQuery>(
    server: ServerDescriptor<TConnection, TQuery>,
): SpacetimeConnection<TConnection, TQuery> {
    const {adapter} = server;
    const reconnectDelayMs = server.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const tokenKey = tokenKeyFor(server);

    const [status, setStatus] = createSignal<ConnectionStatus>("closed");
    const [error, setError] = createSignal<string | null>(null);
    const [active, setActive] = createSignal<TConnection | null>(null);

    const resources = new Map<string, ResourceState<TQuery>>();
    let connection: TConnection | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    /**
     * Whether the connection is *supposed* to be up. `close()` clears it, so a late callback from
     * a closing socket cannot schedule a reconnect nobody asked for.
     */
    let wanted = false;
    /**
     * Identifies the current connection attempt. Callbacks capture the generation they were
     * created for and no-op once it is stale, rather than relying on a flag that is reset before
     * they fire. Two distinct things make that necessary:
     *
     * - The SDK fires `onDisconnect` *after* the socket actually closes, so a deliberately-closed
     *   connection's callback can still run after a replacement has already been dialed.
     * - **SpacetimeDB 2.10 fires both `onConnectError` and `onDisconnect` for a single failed
     *   attempt.** Both call `scheduleReconnect`, so without retiring the generation there the
     *   second callback would schedule a *second* reconnect for the same failure. That is benign
     *   with a flat delay — `scheduleReconnect` clears the pending timer, so the second call
     *   replaces the first rather than stacking — but it stops being benign the moment the delay
     *   grows per attempt: `brico-bot`'s supervisor hit exactly this and doubled twice per cycle
     *   (2s → 4.9s → 9.8s → 12.9s → 28s → 64s). Hence the bump in `scheduleReconnect`.
     *
     * Bumped in `connect()` (a new attempt begins) and in `scheduleReconnect()` (the current
     * attempt is dead), so it is a plain monotonic counter and no caller depends on its value.
     */
    let generation = 0;

    function clearReconnectTimeout() {
        if (reconnectTimeout !== null) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    }

    /** Drops a resource's socket-bound state, leaving it registered so a reconnect re-attaches. */
    function detach(resource: ResourceState<TQuery>) {
        resource.detachListeners?.();
        resource.detachListeners = null;
        resource.subscription?.unsubscribe();
        resource.subscription = null;
        resource.setReady(false);
    }

    function teardown() {
        for (const resource of resources.values()) detach(resource);
        setActive(null);
        if (connection) {
            adapter.close(connection);
            connection = null;
        }
    }

    /**
     * Promotes `syncing` to `live` once every attached resource has its rows.
     *
     * One-way on purpose: a resource added later (a page navigated to while another page's
     * subscription is already applied) must not flip a connection everyone else sees as live back
     * to "syncing". Per-resource readiness is what a newly-mounted page should gate on.
     */
    function refreshStatus() {
        if (status() !== "syncing") return;
        for (const resource of resources.values()) {
            if (!resource.ready()) return;
        }
        setStatus("live");
    }

    function attach(conn: TConnection, resource: ResourceState<TQuery>, gen: number) {
        const notify = () => resource.onChange?.();
        resource.detachListeners = adapter.watch(conn, resource.spec.tables.map(entry => entry.table), notify);
        resource.subscription = adapter.subscribe(conn, resource.spec.tables.map(entry => entry.query), {
            onApplied: () => {
                if (gen !== generation) return;
                resource.setReady(true);
                notify();
                refreshStatus();
            },
            onError: message => {
                if (gen !== generation) return;
                resource.setReady(false);
                setStatus("error");
                setError(message);
            },
        });
    }

    function scheduleReconnect(message: string) {
        // Retire the failed attempt before doing anything else: SpacetimeDB 2.10 reports one
        // failed connection through *both* `onConnectError` and `onDisconnect`, and both land
        // here. Bumping the generation makes the second callback fail its own `gen !== generation`
        // guard, so one failure schedules exactly one redial.
        generation += 1;
        teardown();
        if (!wanted) return;
        clearReconnectTimeout();
        setStatus("error");
        setError(`${message} Reconnecting in ${reconnectDelayMs / 1000}s...`);
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, reconnectDelayMs);
    }

    function connect() {
        clearReconnectTimeout();
        teardown();
        if (!wanted) return;

        const gen = ++generation;
        setStatus("connecting");
        const token = readStored(tokenKey);

        connection = adapter.open({
            uri: server.uri,
            module: server.module,
            token,
            onConnect: (conn, token) => {
                if (gen !== generation) return;
                writeStored(tokenKey, token);
                setError(null);
                setStatus("syncing");
                setActive(() => conn);
                for (const resource of resources.values()) attach(conn, resource, gen);
                refreshStatus();
            },
            onDisconnect: message => {
                if (gen !== generation || !wanted) return;
                scheduleReconnect(message);
            },
            onConnectError: message => {
                if (gen !== generation || !wanted) return;
                // A stored token that fails on the very first dial (never having reached
                // `onConnect` this attempt) is more likely stale/expired than a transient network
                // error — drop it so the redial `scheduleReconnect` schedules falls back to an
                // anonymous connection instead of looping on the same bad credential forever. This
                // is what lets a resource that needs no login (e.g. the craft browser's public
                // bounty view, see `~/lib/crafts/bounty.ts`) still come up for a visitor whose old
                // `brico-app` session has expired.
                if (token !== undefined) clearStored(tokenKey);
                scheduleReconnect(message);
            },
        });
    }

    return {
        server,
        status,
        error,
        active,
        addResource(spec, onChange) {
            const existing = resources.get(spec.key);
            if (existing) detach(existing);

            const [ready, setReady] = createSignal(false);
            const resource: ResourceState<TQuery> = {
                spec, onChange, subscription: null, detachListeners: null, ready, setReady,
            };
            resources.set(spec.key, resource);
            if (connection && adapter.isActive(connection)) attach(connection, resource, generation);

            return {
                ready,
                release: () => {
                    // A replacement registration under the same key owns the slot now; releasing
                    // this stale handle must not detach the live one.
                    if (resources.get(spec.key) !== resource) return;
                    detach(resource);
                    resources.delete(spec.key);
                },
            };
        },
        open() {
            // A bot render must never open a socket, and `localStorage` does not exist there.
            if (isServer || wanted) return;
            wanted = true;
            connect();
        },
        close() {
            wanted = false;
            clearReconnectTimeout();
            teardown();
            setStatus("closed");
            setError(null);
        },
        reconnect() {
            if (isServer) return;
            wanted = true;
            setError(null);
            connect();
        },
        primeToken(token) {
            if (isServer) return;
            writeStored(tokenKey, token);
        },
        clearToken() {
            if (isServer) return;
            clearStored(tokenKey);
        },
    };
}
