/**
 * config.ts — every environment knob the bridge worker reads, in one place.
 *
 * Deliberately *not* Vite's `VITE_*` names: this is a plain Node service, those variables are
 * inlined at build time by a bundler this process never runs, and reusing them would imply the
 * frontend's `.env.local` configures the bot (it doesn't).
 */
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import type {LogLevel} from "./log.ts";

/** `backend/brico-bot/` — anchors default paths to the package, not to the caller's cwd. */
export const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * Loads `backend/brico-bot/.env` if present.
 *
 * `process.loadEnvFile` is built into Node ≥20.12, so there is no dotenv dependency to carry. Real
 * environment variables already set win: `loadEnvFile` does not overwrite them.
 */
export function loadEnvFile(): string | null {
    const envPath = path.join(PACKAGE_ROOT, ".env");
    if (!existsSync(envPath)) return null;
    process.loadEnvFile(envPath);
    return envPath;
}

export interface SpacetimeTarget {
    /** Human label used in logs and as the token-store key prefix. */
    label: string;
    uri: string;
    database: string;
}

/** Config for BitAuth's OIDC relying-party flow. `null` when unconfigured — that half of the HTTP
 * server 503s instead of the process failing to start (see `oidc-client.ts`). */
export interface BitAuthConfig {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
}

/** Config for Discord's OAuth-handshake linking flow. `null` when unconfigured. */
export interface DiscordOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface BotConfig {
    /** prism's `relay-module` — the read-mirror of BitCraft. Always required. */
    prism: SpacetimeTarget;
    /**
     * brico's own module. `null` disables the second connection entirely.
     */
    bricoApp: SpacetimeTarget | null;
    /** How long row changes are coalesced before the snapshot is rebuilt and filters re-run. */
    snapshotIntervalMs: number;
    /** First reconnect delay; doubles per consecutive failure up to `reconnectMaxDelayMs`. */
    reconnectDelayMs: number;
    reconnectMaxDelayMs: number;
    /** Where connection tokens are persisted (the Node stand-in for the browser's localStorage). */
    stateDir: string;
    logLevel: LogLevel;
    /** Log a one-line connection/match summary on this cadence. 0 disables. */
    heartbeatMs: number;
    /**
     * Directory holding BitCraft's offline BSATN static-data files (`<table>.bsatn`)
     */
    gameDataDir: string;
    /** Host/port the BitAuth/Discord link callback HTTP server binds. */
    httpHost: string;
    httpPort: number;
    /** Default/fallback for where the browser is redirected after a link attempt,
     * `?linked=<provider>` or `?linkError=<message>` appended. Used when the login request didn't
     * supply a `returnUrl` (or supplied one outside `linkReturnUrlAllowedOrigins`). */
    linkReturnUrl: string;
    /** Extra origins `/auth/<provider>/login?...&returnUrl=<url>` is allowed to redirect back to —
     * e.g. a preview-branch deploy — beyond `linkReturnUrl`'s own origin (always implicitly
     * allowed). Without this, every environment sharing this one bot process would bounce users
     * back to whichever origin `linkReturnUrl` happens to be set to. */
    linkReturnUrlAllowedOrigins: string[];
    /** `null` disables the BitAuth half of the HTTP server (its routes 503) */
    bitauth: BitAuthConfig | null;
    /** `null` disables Discord's OAuth-handshake linking route */
    discordOAuth: DiscordOAuthConfig | null;
}

function str(name: string, fallback: string): string {
    const raw = process.env[name];
    return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function optionalStr(name: string): string | null {
    const raw = process.env[name];
    return raw === undefined || raw.trim() === "" ? null : raw.trim();
}

function int(name: string, fallback: number): number {
    const raw = optionalStr(name);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative number, got ${JSON.stringify(raw)}`);
    }
    return Math.floor(parsed);
}

function bool(name: string, fallback: boolean): boolean {
    const raw = optionalStr(name)?.toLowerCase();
    if (raw === undefined || raw === null) return fallback;
    if (["1", "true", "yes", "on"].includes(raw)) return true;
    if (["0", "false", "no", "off"].includes(raw)) return false;
    throw new Error(`${name} must be a boolean-ish value, got ${JSON.stringify(raw)}`);
}

function logLevel(): LogLevel {
    const raw = str("BRICO_BOT_LOG_LEVEL", "info").toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
    throw new Error(`BRICO_BOT_LOG_LEVEL must be debug|info|warn|error, got ${JSON.stringify(raw)}`);
}

/** `null` unless every required variable for this provider is set — see `BitAuthConfig`/`DiscordOAuthConfig`. */
function bitAuthConfig(httpBaseUrl: string): BitAuthConfig | null {
    const clientId = optionalStr("BITAUTH_CLIENT_ID");
    const clientSecret = optionalStr("BITAUTH_CLIENT_SECRET");
    if (clientId === null || clientSecret === null) return null;
    return {
        issuer: str("BITAUTH_ISSUER", "https://auth.trinit.is"),
        clientId,
        clientSecret,
        redirectUri: str("BITAUTH_REDIRECT_URI", `${httpBaseUrl}/auth/bitauth/callback`),
        // openid profile is sufficient for the sub/preferred_username this app reads.
        scope: str("BITAUTH_SCOPE", "openid profile"),
    };
}

function discordOAuthConfig(httpBaseUrl: string): DiscordOAuthConfig | null {
    const clientId = optionalStr("DISCORD_OAUTH_CLIENT_ID");
    const clientSecret = optionalStr("DISCORD_OAUTH_CLIENT_SECRET");
    if (clientId === null || clientSecret === null) return null;
    return {
        clientId,
        clientSecret,
        redirectUri: str("DISCORD_OAUTH_REDIRECT_URI", `${httpBaseUrl}/auth/discord/callback`),
    };
}

export function loadConfig(): BotConfig {
    const stateDir = path.resolve(PACKAGE_ROOT, str("BRICO_BOT_STATE_DIR", ".state"));
    // Defaults are container-friendly (bind every interface; the real public URL this deploys
    // behind) — running bare on a workstation wants BRICO_BOT_HTTP_HOST/PORT/BASE_URL overridden
    // to the loopback values in `.env.example` instead.
    const httpHost = str("BRICO_BOT_HTTP_HOST", "0.0.0.0");
    const httpPort = int("BRICO_BOT_HTTP_PORT", 8080);
    // The base a provider's dashboard needs registered as a redirect URI. Deliberately not derived
    // from httpHost/httpPort — "0.0.0.0" is a bind address, not something BitAuth/Discord (or a
    // browser) can ever be redirected to.
    const httpBaseUrl = str("BRICO_BOT_HTTP_BASE_URL", "https://bot.brico.app");

    const prism: SpacetimeTarget = {
        label: "prism",
        uri: str("BRICO_RELAY_HOST", "https://st.prism.brico.app"),
        database: str("BRICO_RELAY_MODULE", "prism-relay"),
    };

    const appEnabled = bool("BRICO_APP_ENABLED", true);
    const bricoApp: SpacetimeTarget | null = appEnabled
        ? {
            label: "brico-app",
            uri: str("BRICO_APP_HOST", "https://st.prism.brico.app"),
            database: str("BRICO_APP_MODULE", "brico-app"),
        }
        : null;

    return {
        prism,
        bricoApp,
        snapshotIntervalMs: int("BRICO_BOT_SNAPSHOT_INTERVAL_MS", 1000),
        reconnectDelayMs: int("BRICO_BOT_RECONNECT_DELAY_MS", 5000),
        reconnectMaxDelayMs: int("BRICO_BOT_RECONNECT_MAX_DELAY_MS", 60_000),
        stateDir,
        logLevel: logLevel(),
        heartbeatMs: int("BRICO_BOT_HEARTBEAT_MS", 60_000),
        gameDataDir: path.resolve(PACKAGE_ROOT, str("BRICO_BOT_GAME_DATA_DIR", "../../frontend/public/bsatn/static")),
        httpHost,
        httpPort,
        linkReturnUrl: str("BRICO_BOT_LINK_RETURN_URL", "https://brico.app/account/profile"),
        linkReturnUrlAllowedOrigins: (optionalStr("BRICO_BOT_LINK_RETURN_URL_ALLOWED_ORIGINS") ?? "")
            .split(",")
            .map(origin => origin.trim())
            .filter(origin => origin !== ""),
        bitauth: bitAuthConfig(httpBaseUrl),
        discordOAuth: discordOAuthConfig(httpBaseUrl),
    };
}
