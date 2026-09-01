/**
 * connection.ts — a supervised, self-healing SpacetimeDB connection for a long-running process.
 *
 * This is the Node-side counterpart of the pattern proven in `frontend/src/lib/crafts/relay.ts`:
 * token persistence, reconnect with backoff, and **generation-guarded callbacks** (the SDK fires
 * `onDisconnect` asynchronously, after the socket actually closes, so a deliberately-replaced
 * connection's callback can still run once a newer one has already been dialed — every callback
 * therefore captures the generation it was created for and no-ops when it's stale).
 *
 * It is *not* an import of that file, and must not become one. That file is Solid-flavored
 * (`createSignal`/`onMount`/`onCleanup`) and browser-flavored (`localStorage`, one connection for
 * the lifetime of a component); this one is callback-flavored and lives for the lifetime of a
 * process.
 *
 * Generic over the module: the generated `DbConnection` of every module is a distinct class, so the
 * per-module bits (which builder to call, which tables to subscribe) are supplied by the caller as
 * a `ConnectionSpec` and everything else here is module-agnostic. That is also what keeps this
 * usable for `brico-app` without importing its bindings — see `app/connection.ts`.
 */
import type {Logger} from "../log.ts";
import type {TokenStore} from "./token-store.ts";

/** The slice of a generated `DbConnection` this supervisor needs. */
export interface LiveConnection {
    readonly isActive: boolean;
    disconnect(): void;
}

export type Teardown = () => void;

/** Reported for observability only — reconnect decisions are driven by the SDK's callbacks. */
export type ConnectionStatus = "idle" | "connecting" | "syncing" | "live" | "error" | "stopped";

/** What a `ConnectionSpec.dial` implementation must wire onto the SDK's builder. */
export interface DialHandlers<TConn extends LiveConnection> {
    /** Previously stored token, or `undefined` to connect anonymously and be issued a new one. */
    token: string | undefined;
    onConnect(conn: TConn, identity: {toHexString(): string}, token: string): void;
    onDisconnect(error?: Error): void;
    onConnectError(error?: Error): void;
}

/** Handed to `onConnected` so the spec can report subscription progress back to the supervisor. */
export interface ConnectedContext {
    /** The initial subscription has been applied — the client cache is populated. */
    setLive(): void;
    /** A subscription (not the socket) failed. Does not itself trigger a reconnect. */
    setError(message: string): void;
    /** True while this connect attempt is still the current one — check before doing real work. */
    isCurrent(): boolean;
}

export interface ConnectionSpec<TConn extends LiveConnection> {
    label: string;
    uri: string;
    database: string;
    /** Build and dial. Wire every handler in `handlers` onto the generated builder. */
    dial(handlers: DialHandlers<TConn>): TConn;
    /**
     * Register table callbacks and subscriptions. Runs inside the generation guard, immediately
     * after the token is stored. Return a teardown (typically `() => sub.unsubscribe()`).
     */
    onConnected(conn: TConn, ctx: ConnectedContext): Teardown | void;
}

export interface SupervisedConnection<TConn extends LiveConnection> {
    readonly label: string;
    readonly status: ConnectionStatus;
    readonly error: string | null;
    /** The live connection, or `null` when not currently connected. */
    readonly connection: TConn | null;
    /** True once the initial subscription has been applied. */
    readonly isLive: boolean;
    start(): void;
    /** Drop the current connection and dial again immediately, resetting backoff. */
    reconnect(): void;
    /** Permanent: cancels any pending reconnect and stops supervising. */
    stop(): void;
}

export interface SupervisorOptions {
    tokens: TokenStore;
    log: Logger;
    /** First reconnect delay. Doubles per consecutive failure, capped at `maxDelayMs`. */
    delayMs: number;
    maxDelayMs: number;
}

export function createSupervisedConnection<TConn extends LiveConnection>(
    spec: ConnectionSpec<TConn>,
    options: SupervisorOptions,
): SupervisedConnection<TConn> {
    const log = options.log.child(spec.label);
    const tokenKey = `${spec.label}:${spec.uri}/${spec.database}/auth_token`;

    let connection: TConn | null = null;
    let teardownSubscriptions: Teardown | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let status: ConnectionStatus = "idle";
    let error: string | null = null;
    let isLive = false;
    let stopped = false;
    let attempt = 0;
    // See the file header: every callback captures this and bails if it has moved on.
    let generation = 0;

    function clearReconnectTimer(): void {
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function teardown(): void {
        try {
            teardownSubscriptions?.();
        } catch (cause) {
            log.debug("subscription teardown threw", {error: describe(cause)});
        }
        teardownSubscriptions = null;
        isLive = false;
        if (connection) {
            try {
                connection.disconnect();
            } catch (cause) {
                log.debug("disconnect threw", {error: describe(cause)});
            }
            connection = null;
        }
    }

    /** Exponential backoff with jitter, so a relay restart doesn't get a synchronised stampede. */
    function nextDelayMs(): number {
        const base = Math.min(options.delayMs * 2 ** Math.max(attempt - 1, 0), options.maxDelayMs);
        return Math.round(base * (0.75 + Math.random() * 0.5));
    }

    function scheduleReconnect(message: string): void {
        if (stopped) return;
        // A single failed attempt fires *both* `onConnectError` and `onDisconnect` (observed
        // against SpacetimeDB 2.10 for a nonexistent database), and each of them is a legitimate
        // reason to reconnect. Retiring the generation here makes whichever arrives second no-op,
        // so one failure costs one `attempt` — without this the backoff doubles twice per cycle
        // and a brief outage escalates to the maximum delay in half the intended time.
        generation += 1;
        clearReconnectTimer();
        status = "error";
        error = message;
        attempt += 1;
        const delay = nextDelayMs();
        log.warn(message, {retryInMs: delay, attempt});
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    function connect(): void {
        clearReconnectTimer();
        teardown();
        if (stopped) return;

        const gen = ++generation;
        status = "connecting";
        log.info("dialing", {uri: spec.uri, database: spec.database});

        const ctx: ConnectedContext = {
            isCurrent: () => gen === generation && !stopped,
            setLive: () => {
                if (gen !== generation || stopped) return;
                status = "live";
                error = null;
                isLive = true;
                // Only a *fully* established connection resets backoff. Resetting it in
                // `onConnect` would turn a module that accepts sockets and then fails every
                // subscription into a tight reconnect loop.
                attempt = 0;
                log.info("live");
            },
            setError: message => {
                if (gen !== generation || stopped) return;
                status = "error";
                error = message;
                log.error(message);
            },
        };

        try {
            connection = spec.dial({
                token: options.tokens.read(tokenKey),
                onConnect: (conn, identity, token) => {
                    if (gen !== generation || stopped) return;
                    options.tokens.write(tokenKey, token);
                    status = "syncing";
                    error = null;
                    log.info("connected", {identity: identity.toHexString()});
                    teardownSubscriptions = spec.onConnected(conn, ctx) ?? null;
                },
                onDisconnect: cause => {
                    if (gen !== generation || stopped) return;
                    scheduleReconnect(`disconnected: ${describe(cause)}`);
                },
                onConnectError: cause => {
                    if (gen !== generation || stopped) return;
                    scheduleReconnect(`connect error: ${describe(cause)}`);
                },
            });
        } catch (cause) {
            // `build()` can throw synchronously (bad URI, bad module name); that path never fires
            // `onConnectError`, so it needs its own retry or the supervisor would silently die.
            scheduleReconnect(`dial failed: ${describe(cause)}`);
        }
    }

    return {
        label: spec.label,
        get status() {
            return status;
        },
        get error() {
            return error;
        },
        get connection() {
            return connection;
        },
        get isLive() {
            return isLive;
        },
        start() {
            if (stopped) throw new Error(`connection ${spec.label} was stopped and cannot restart`);
            if (status !== "idle") return;
            connect();
        },
        reconnect() {
            attempt = 0;
            connect();
        },
        stop() {
            stopped = true;
            clearReconnectTimer();
            teardown();
            status = "stopped";
        },
    };
}

function describe(cause: unknown): string {
    if (cause === undefined || cause === null) return "no reason given";
    if (cause instanceof Error) return cause.message || cause.name;
    return String(cause);
}
