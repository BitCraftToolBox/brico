/**
 * auth.ts — how the bot's Stelo connection gets its id token, and the alert when that stops working.
 *
 * `permanent` mode uses the token stored for the connection as-is. `refresh` mode keeps a short-lived
 * id token and a one-time-use refresh token in the state dir and renews both through oidc-client-ts's
 * `signinSilent`; a human does the interactive login and seeds the two files (see `.env.example`).
 */
import {decodeJwt} from "jose";
import {type StateStore, UserManager} from "oidc-client-ts";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import type {TokenStore} from "../spacetime/token-store.ts";

export interface SteloAuth {
    /** Token source for the supervised connection; read on every dial. */
    readonly tokens: TokenStore;
    /** Starts scheduled renewal (refresh mode); does nothing otherwise. */
    start(): void;
    stop(): void;
    /** Feed every connect failure here; Stelo rejecting the token (not an outage) alerts a human. */
    noteConnectError(cause: unknown): void;
    /** Feed every successful connect here; ends the current alert episode. */
    noteConnected(): void;
}

export interface SteloAuthOptions {
    config: SteloConfig;
    /** The bot's file token store; refresh mode keeps its two files in it. */
    tokens: TokenStore;
    log: Logger;
    fetch?: typeof fetch;
}

/** Keys in the file token store (`stelo_id_token.token`, `stelo_refresh_token.token`). */
export const ID_TOKEN_KEY = "stelo:id_token";
export const REFRESH_TOKEN_KEY = "stelo:refresh_token";

const SCOPE = "openid offline_access";
/** Renew this long before the id token expires, if that is sooner than the refresh interval. */
const EXPIRY_MARGIN_MS = 60_000;
/** Floor between renewals, so a token that is already near expiry cannot spin. */
const MIN_DELAY_MS = 1000;
/** Pause between attempts after a failed renewal; the refresh token outlives the 12 h interval, so retrying is worthwhile. */
const RETRY_MS = 10 * 60 * 1000;

/**
 * True when Stelo/maincloud refused the token, as opposed to being unreachable. The SDK POSTs the token to
 * `/v1/identity/websocket-token` before opening the socket and fails with that response's status text.
 */
export function isAuthRejection(cause: unknown): boolean {
    return cause instanceof Error && /^Failed to verify token: (Unauthorized|Forbidden)$/i.test(cause.message);
}

/** One alert per failure episode: the next is allowed after `recover()`. */
function createAlerter(webhook: string | null, log: Logger, doFetch: typeof fetch) {
    let alerted = false;

    async function post(content: string): Promise<void> {
        if (webhook === null) return;
        try {
            const response = await doFetch(webhook, {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({content, allowed_mentions: {parse: []}}),
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) log.error("auth alert webhook rejected the message", {status: response.status});
        } catch (cause) {
            log.error("auth alert webhook failed", {error: cause instanceof Error ? cause.message : String(cause)});
        }
    }

    return {
        fail(reason: string): void {
            log.error(`stelo auth failure: ${reason}`);
            if (alerted) return;
            alerted = true;
            void post(`⚠️ brico-bot cannot authenticate to Stelo: ${reason}. A human must log in again and replace the tokens.`);
        },
        recover(): void {
            if (!alerted) return;
            alerted = false;
            log.info("stelo auth recovered");
            void post("✅ brico-bot authenticated to Stelo again.");
        },
    };
}

function createMemoryStore(): StateStore {
    const memory = new Map<string, string>();
    return {
        async get(key) {
            return memory.get(key) ?? null;
        },
        async set(key, value) {
            memory.set(key, value);
        },
        async remove(key) {
            const previous = memory.get(key) ?? null;
            memory.delete(key);
            return previous;
        },
        async getAllKeys() {
            return [...memory.keys()];
        },
    };
}

/** An oidc-client-ts user store backed by the id- and refresh-token files; any other key lives in memory. */
function createFileUserStore(tokens: TokenStore): StateStore {
    const memory = createMemoryStore();
    const isUser = (key: string) => key.startsWith("user:");
    return {
        async get(key) {
            if (!isUser(key)) return memory.get(key);
            const idToken = tokens.read(ID_TOKEN_KEY);
            const refreshToken = tokens.read(REFRESH_TOKEN_KEY);
            if (idToken === undefined || refreshToken === undefined) return null;
            const claims = decodeJwt(idToken);
            return JSON.stringify({
                id_token: idToken,
                refresh_token: refreshToken,
                access_token: "",
                token_type: "Bearer",
                scope: SCOPE,
                profile: claims,
                expires_at: claims.exp,
            });
        },
        async set(key, value) {
            if (!isUser(key)) return memory.set(key, value);
            const user = JSON.parse(value) as {id_token?: unknown; refresh_token?: unknown};
            if (typeof user.id_token !== "string" || typeof user.refresh_token !== "string") {
                throw new Error("renewal did not return both an id token and a refresh token");
            }
            // Refresh token first: it is one-time-use, so losing it strands the bot, while a stale id token only needs a renewal.
            tokens.write(REFRESH_TOKEN_KEY, user.refresh_token);
            tokens.write(ID_TOKEN_KEY, user.id_token);
        },
        async remove(key) {
            // Never delete the credential files; a human re-seeds them.
            return isUser(key) ? null : memory.remove(key);
        },
        getAllKeys: () => memory.getAllKeys(),
    };
}

export function createSteloAuth(options: SteloAuthOptions): SteloAuth {
    const {config} = options;
    const log = options.log.child("stelo-auth");
    const alerter = createAlerter(config.authAlertWebhook, log, options.fetch ?? fetch);
    const {auth} = config;

    const base = {
        noteConnectError(cause: unknown): void {
            if (isAuthRejection(cause)) alerter.fail(`Stelo rejected the token (${(cause as Error).message})`);
        },
        noteConnected: () => alerter.recover(),
    };

    if (auth.mode === "permanent") {
        return {...base, tokens: options.tokens, start() {}, stop() {}};
    }

    const {refreshIntervalMs} = auth;
    const manager = new UserManager({
        authority: auth.authority,
        client_id: auth.clientId,
        // Required by the settings but unused: the bot never starts an interactive login.
        redirect_uri: "http://localhost/unused",
        response_type: "code",
        scope: SCOPE,
        automaticSilentRenew: false,
        userStore: createFileUserStore(options.tokens),
        stateStore: createMemoryStore(),
    });

    // Reads the file every dial, so a renewed (or hand-replaced) token is picked up on reconnect.
    const tokens: TokenStore = {
        read() {
            const token = options.tokens.read(ID_TOKEN_KEY);
            if (token === undefined) {
                // Dialing without a token would connect anonymously as a new identity.
                alerter.fail("no id token in the state dir");
                throw new Error("stelo id token is missing");
            }
            return token;
        },
        write() {},
    };

    let timer: NodeJS.Timeout | null = null;
    let stopped = false;

    /** Ms until the next renewal: the refresh interval after the last one, or sooner if the id token expires first. */
    function delayMs(): number {
        const idToken = options.tokens.read(ID_TOKEN_KEY);
        if (idToken === undefined) return RETRY_MS;
        const {iat, exp} = decodeJwt(idToken);
        const due = Math.min(
            iat === undefined ? 0 : iat * 1000 + refreshIntervalMs,
            exp === undefined ? Infinity : exp * 1000 - EXPIRY_MARGIN_MS,
        );
        return Math.max(due - Date.now(), MIN_DELAY_MS);
    }

    function schedule(delay: number): void {
        if (stopped) return;
        timer = setTimeout(() => void renew(), delay);
        timer.unref();
        log.debug("next stelo token renewal", {inMs: delay});
    }

    async function renew(): Promise<void> {
        timer = null;
        let next = RETRY_MS;
        try {
            if (options.tokens.read(ID_TOKEN_KEY) === undefined || options.tokens.read(REFRESH_TOKEN_KEY) === undefined) {
                throw new Error("the id token or refresh token file is missing from the state dir");
            }
            const user = await manager.signinSilent();
            if (!user?.id_token) throw new Error("renewal returned no user");
            log.info("renewed stelo tokens");
            alerter.recover();
            next = delayMs();
        } catch (cause) {
            alerter.fail(`token renewal failed (${cause instanceof Error ? cause.message : String(cause)})`);
        }
        schedule(next);
    }

    return {
        ...base,
        tokens,
        start() {
            // Empty files show a human where to paste the tokens; an empty file reads as missing.
            for (const key of [ID_TOKEN_KEY, REFRESH_TOKEN_KEY]) {
                if (options.tokens.read(key) === undefined) options.tokens.write(key, "");
            }
            let first: number;
            try {
                first = delayMs();
            } catch (cause) {
                alerter.fail(`stored id token is unreadable (${cause instanceof Error ? cause.message : String(cause)})`);
                first = RETRY_MS;
            }
            schedule(first);
        },
        stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}
