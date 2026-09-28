/**
 * http-server.ts — the small persistent HTTP surface `brico-bot` needs to be BitAuth's and
 * Discord's OAuth relying party. Also serves the Discord bot routes: `POST /discord/interactions`,
 * the `/discord/install` redirect pair, and `GET /icons/:shape/:id.webp` (watch display thumbnails).
 *
 * Both OAuth link providers follow the same shape end to end:
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
import type {IconRenderer} from "./discord/icon-composite.ts";
import {type ItemIconIndex, itemIconKey} from "./game-data/item-icons.ts";
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
    /** Handler for `POST /discord/interactions`; `null` when the bot is not configured (route 503s). */
    discordInteractions: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null;
    /** Self-serve "add to your server" flow (`/discord/install[/callback]`); `null` disables it (503). */
    discordInstall: {
        buildAuthorizeUrl(): string;
        /** Exchanges the callback's `code` for the granted guild id (the `guild_id` query param is untrusted). */
        resolveInstalledGuildId(code: string): Promise<string>;
        /** Persists the install (`upsertDiscordGuildInstall`) and re-runs guild command registration for it. */
        onInstalled(args: {guildId: string}): Promise<void>;
    } | null;
    /** Backs `GET /icons/:shape/:id.webp`. */
    icons: {
        index: ItemIconIndex;
        renderer: IconRenderer;
    };
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

    function handleDiscordInstall(res: ServerResponse): void {
        if (!options.discordInstall) return sendText(res, 503, "Discord bot install is not configured");
        redirect(res, options.discordInstall.buildAuthorizeUrl());
    }

    async function handleDiscordInstallCallback(url: URL, res: ServerResponse): Promise<void> {
        if (!options.discordInstall) return sendText(res, 503, "Discord bot install is not configured");
        const installedPageUrl = `${defaultReturnOrigin}/discord/installed`;

        const oauthError = url.searchParams.get("error");
        if (oauthError) return redirect(res, withParam(installedPageUrl, "error", oauthError));
        const code = url.searchParams.get("code");
        if (!code) return redirect(res, withParam(installedPageUrl, "error", "installation was cancelled"));

        // Still undefined in the catch if the token exchange itself failed.
        let guildId: string | undefined;
        try {
            // The query string's `guild_id` is deliberately not read; it can be forged.
            guildId = await options.discordInstall.resolveInstalledGuildId(code);
            await options.discordInstall.onInstalled({guildId});
            options.log.info("Installed in Discord guild", {guildId});
            redirect(res, withParam(installedPageUrl, "guild", guildId));
        } catch (cause) {
            options.log.error("Discord install finalization failed", {guildId, error: describeError(cause)});
            redirect(res, withParam(installedPageUrl, "error", "couldn't finish installing the bot — try again in a moment"));
        }
    }

    async function handleMetrics(res: ServerResponse): Promise<void> {
        res.writeHead(200, {"content-type": registry.contentType});
        res.end(await registry.metrics());
    }

    const iconPathPattern = /^\/icons\/(item|cargo)\/(\d+)\.webp$/;

    async function handleIcon(shape: "item" | "cargo", id: number, res: ServerResponse): Promise<void> {
        const facts = options.icons.index.get(itemIconKey(shape, id));
        if (!facts) return sendText(res, 404, "unknown icon");
        try {
            const image = await options.icons.renderer.render(shape, id, facts);
            // Output is fixed for the loaded game-data version, so it can be cached indefinitely.
            res.writeHead(200, {"content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable"});
            res.end(image);
        } catch (cause) {
            options.log.error("icon render failed", {shape, id, error: describeError(cause)});
            sendText(res, 502, "icon render failed");
        }
    }

    const routes: Record<string, (url: URL, res: ServerResponse) => void | Promise<void>> = {
        "/healthz": (_url, res) => sendText(res, 200, "ok"),
        "/metrics": (_url, res) => handleMetrics(res),
        "/auth/bitauth/login": (url, res) => handleBitauthLogin(url, res),
        "/auth/bitauth/callback": (url, res) => handleBitauthCallback(url, res),
        "/auth/discord/login": (url, res) => handleDiscordLogin(url, res),
        "/auth/discord/callback": (url, res) => handleDiscordCallback(url, res),
        "/discord/install": (_url, res) => handleDiscordInstall(res),
        "/discord/install/callback": (url, res) => handleDiscordInstallCallback(url, res),
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${options.host}:${options.port}`}`);

        if (req.method === "POST" && url.pathname === "/discord/interactions") {
            if (!options.discordInteractions) {
                sendText(res, 503, "Discord bot is not configured");
                return;
            }
            options.discordInteractions(req, res).catch(cause => {
                options.log.error("discord interactions route threw", {error: describeError(cause)});
                if (!res.headersSent) sendText(res, 500, "internal error");
            });
            return;
        }

        const iconMatch = req.method === "GET" ? iconPathPattern.exec(url.pathname) : null;
        if (iconMatch) {
            handleIcon(iconMatch[1] as "item" | "cargo", Number(iconMatch[2]), res).catch(cause => {
                options.log.error("icon route threw", {path: url.pathname, error: describeError(cause)});
                if (!res.headersSent) sendText(res, 500, "internal error");
            });
            return;
        }

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
