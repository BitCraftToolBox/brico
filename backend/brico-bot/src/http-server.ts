/**
 * http-server.ts — the small persistent HTTP surface `brico-bot` needs to be BitAuth's and
 * Discord's OAuth relying party.
 *
 * Both providers follow the same shape end to end:
 *   1. The browser has already called `beginIntegrationLink({code, provider})` on `brico-app`, then navigates here.
 *   2. `/auth/<provider>/login` mints an OAuth `state` (and, for BitAuth, a PKCE pair), remembers
 *      the brico link `code` against it in `LinkStateStore`, and redirects out.
 *   3. `/auth/<provider>/callback` resolves `state` back to that `code`, exchanges the
 *      authorization code, and calls `noteIntegrationLinkExternal({code, externalId,
 *      externalHandle})` on `brico-app` — finalizing the link, since `accountIdentity` was already
 *      set in step 1.
 *   4. Either way, the browser is redirected back to a return URL with `?linked=<provider>` or
 *      `?linkError=<message>` for the frontend to render. Step 1's navigation may carry
 *      `&returnUrl=<url>` so a different frontend origin (e.g. a preview-branch deploy) gets sent
 *      back to itself rather than to `returnUrl`'s configured default — see `resolveReturnUrl`.
 */
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import type {DiscordOAuthClient} from "./auth/discord-oauth.ts";

import {createLinkStateStore, type LinkStateStore} from "./auth/link-state-store.ts";
import type {OidcClient} from "./auth/oidc-client.ts";
import {codeChallengeS256, generateCodeVerifier, generateState} from "./auth/pkce.ts";
import type {Logger} from "./log.ts";
import {registry} from "./metrics.ts";

export interface LinkHttpServerOptions {
    host: string;
    port: number;
    log: Logger;
    /** Default/fallback for where the browser lands after a link attempt, success or failure. */
    returnUrl: string;
    /** Extra origins a login request's `returnUrl` param is allowed to target, beyond `returnUrl`'s
     * own origin (always implicitly allowed). Anything else falls back to `returnUrl`. */
    returnUrlAllowedOrigins: string[];
    /** `null` when `BITAUTH_CLIENT_ID`/etc. are not configured — that provider 404s instead of crashing startup. */
    bitauth: OidcClient | null;
    discordOAuth: DiscordOAuthClient | null;
    /** Calls `brico-app`'s `noteIntegrationLinkExternal`. Rejects with the reducer's own `SenderError`
     * message (e.g. "unknown or expired link code", the cross-account collision message) — that
     * message is safe to surface to the browser as-is. */
    noteExternalLink(args: {code: string; externalId: string; externalHandle: string | undefined}): Promise<void>;
}

export interface LinkHttpServer {
    start(): void;
    stop(): void;
}

function sendText(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, {"content-type": "text/plain; charset=utf-8"});
    res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
    res.writeHead(302, {location});
    res.end();
}

function withParam(base: string, key: string, value: string): string {
    const url = new URL(base);
    url.searchParams.set(key, value);
    return url.toString();
}

function describeError(cause: unknown): string {
    if (cause instanceof Error) return cause.message;
    return String(cause);
}

export function createLinkHttpServer(options: LinkHttpServerOptions): LinkHttpServer {
    const stateStore: LinkStateStore = createLinkStateStore();
    const defaultReturnOrigin = new URL(options.returnUrl).origin;
    const allowedReturnOrigins = new Set([defaultReturnOrigin, ...options.returnUrlAllowedOrigins]);

    /**
     * A login request's `returnUrl` param is untrusted browser input — used unchecked, it's an open
     * redirect. Only honor it when its origin is `returnUrl`'s own or in `returnUrlAllowedOrigins`;
     * otherwise (missing, unparsable, or not allowlisted) fall back to the configured default.
     */
    function resolveReturnUrl(url: URL): string {
        const requested = url.searchParams.get("returnUrl");
        if (!requested) return options.returnUrl;
        try {
            const parsed = new URL(requested);
            return allowedReturnOrigins.has(parsed.origin) ? parsed.toString() : options.returnUrl;
        } catch {
            return options.returnUrl;
        }
    }

    function failLink(res: ServerResponse, returnUrl: string, message: string): void {
        redirect(res, withParam(returnUrl, "linkError", message));
    }

    async function handleBitauthLogin(url: URL, res: ServerResponse): Promise<void> {
        if (!options.bitauth) return sendText(res, 503, "BitAuth linking is not configured");
        const linkCode = url.searchParams.get("linkCode");
        if (!linkCode) return sendText(res, 400, "missing linkCode");

        const state = generateState();
        const codeVerifier = generateCodeVerifier();
        stateStore.put(state, {linkCode, codeVerifier, returnUrl: resolveReturnUrl(url)});
        const authorizeUrl = await options.bitauth.buildAuthorizeUrl(state, codeChallengeS256(codeVerifier));
        redirect(res, authorizeUrl);
    }

    async function handleBitauthCallback(url: URL, res: ServerResponse): Promise<void> {
        if (!options.bitauth) return sendText(res, 503, "BitAuth linking is not configured");
        const state = url.searchParams.get("state");
        if (!state) return sendText(res, 400, "missing state");
        const pending = stateStore.take(state);
        if (!pending || pending.codeVerifier === undefined) return sendText(res, 400, "unknown or expired state");
        const returnUrl = pending.returnUrl ?? options.returnUrl;

        const oauthError = url.searchParams.get("error");
        if (oauthError) return failLink(res, returnUrl, `BitAuth: ${oauthError}`);
        const code = url.searchParams.get("code");
        if (!code) return failLink(res, returnUrl, "BitAuth callback missing code");

        try {
            const identity = await options.bitauth.exchangeCode(code, pending.codeVerifier);
            const externalHandle = typeof identity.claims.preferred_username === "string"
                ? identity.claims.preferred_username
                : undefined;
            await options.noteExternalLink({code: pending.linkCode, externalId: identity.sub, externalHandle});
            redirect(res, withParam(returnUrl, "linked", "bitcraft-ea2"));
        } catch (cause) {
            options.log.warn("BitAuth link finalization failed", {error: describeError(cause)});
            failLink(res, returnUrl, describeError(cause));
        }
    }

    function handleDiscordLogin(url: URL, res: ServerResponse): void {
        if (!options.discordOAuth) return sendText(res, 503, "Discord linking is not configured");
        const linkCode = url.searchParams.get("linkCode");
        if (!linkCode) return sendText(res, 400, "missing linkCode");

        const state = generateState();
        stateStore.put(state, {linkCode, returnUrl: resolveReturnUrl(url)});
        redirect(res, options.discordOAuth.buildAuthorizeUrl(state));
    }

    async function handleDiscordCallback(url: URL, res: ServerResponse): Promise<void> {
        if (!options.discordOAuth) return sendText(res, 503, "Discord linking is not configured");
        const state = url.searchParams.get("state");
        if (!state) return sendText(res, 400, "missing state");
        const pending = stateStore.take(state);
        if (!pending) return sendText(res, 400, "unknown or expired state");
        const returnUrl = pending.returnUrl ?? options.returnUrl;

        const oauthError = url.searchParams.get("error");
        if (oauthError) return failLink(res, returnUrl, `Discord: ${oauthError}`);
        const code = url.searchParams.get("code");
        if (!code) return failLink(res, returnUrl, "Discord callback missing code");

        try {
            const identity = await options.discordOAuth.exchangeCode(code);
            await options.noteExternalLink({
                code: pending.linkCode,
                externalId: identity.id,
                externalHandle: identity.username,
            });
            redirect(res, withParam(returnUrl, "linked", "discord"));
        } catch (cause) {
            options.log.warn("Discord link finalization failed", {error: describeError(cause)});
            failLink(res, returnUrl, describeError(cause));
        }
    }

    async function handleMetrics(res: ServerResponse): Promise<void> {
        res.writeHead(200, {"content-type": registry.contentType});
        res.end(await registry.metrics());
    }

    const routes: Record<string, (url: URL, res: ServerResponse) => void | Promise<void>> = {
        "/healthz": (_url, res) => sendText(res, 200, "ok"),
        "/metrics": (_url, res) => handleMetrics(res),
        "/auth/bitauth/login": (url, res) => handleBitauthLogin(url, res),
        "/auth/bitauth/callback": (url, res) => handleBitauthCallback(url, res),
        "/auth/discord/login": (url, res) => handleDiscordLogin(url, res),
        "/auth/discord/callback": (url, res) => handleDiscordCallback(url, res),
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${options.host}:${options.port}`}`);
        const handler = routes[url.pathname];
        if (!handler) {
            sendText(res, 404, "not found");
            return;
        }
        Promise.resolve(handler(url, res)).catch(cause => {
            options.log.error("link route threw", {path: url.pathname, error: describeError(cause)});
            if (!res.headersSent) sendText(res, 500, "internal error");
        });
    });

    return {
        start() {
            server.listen(options.port, options.host, () => {
                options.log.info("link http server listening", {host: options.host, port: options.port});
            });
        },
        stop() {
            server.close();
        },
    };
}
