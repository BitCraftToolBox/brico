/**
 * config.ts — every environment knob the bridge worker reads, in one place.
 *
 * Deliberately *not* Vite's `VITE_*` names: this is a plain Node service, those variables are
 * inlined at build time by a bundler this process never runs, and reusing them would imply the
 * frontend's `.env.local` configures the bot (it doesn't).
 */
import {ESCROWED_BOUNTY_CURRENCIES, MANUALLY_RECORDED_BOUNTY_CURRENCIES} from "@brico/crafts/currencies";
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

/** Config for the Discord bot itself (slash commands + REST delivery), separate from account linking. */
export interface DiscordBotConfig {
    /** Bot token, used to authenticate every outgoing REST call (`Authorization: Bot <token>`). */
    token: string;
    /** Ed25519 public key Discord signs every interaction payload with — verified by `verifyKey`. */
    publicKey: string;
    /** Addresses the application's command-registration and interaction-followup routes. */
    applicationId: string;
    /** Guild the registration script targets by default. */
    testGuildId: string | null;
    /** OAuth2 client secret for the `/discord/install` callback; `null` disables only that flow. */
    installClientSecret: string | null;
}

/** What happens to escrow-backed money owed to a payee with no routable payout wallet, after `afterDays`. */
export type UnclaimedPolicy =
    | {action: "rollover"; to: string; afterDays: number}
    | {action: "refund"; afterDays: number};

/** One escrowed bounty currency's Stelo backing. */
export interface SteloCurrencyConfig {
    /** Name of the Stelo ledger this currency lives on. */
    ledger: string;
    /** Stelo account id of the Debit escrow wallet the bot holds this currency's funds in. */
    escrowAccountId: bigint;
    unclaimed: UnclaimedPolicy;
}

/**
 * How the bot authenticates to Stelo. `permanent`: the state dir holds one long-lived id token.
 * `refresh`: it holds a short-lived id token and a one-time-use refresh token, which the bot
 * renews against `authority` (a human does the interactive login and seeds both files).
 */
export type SteloAuthConfig =
    | {mode: "permanent"}
    | {mode: "refresh"; authority: string; clientId: string; refreshIntervalMs: number};

export interface SteloConfig {
    target: SpacetimeTarget;
    auth: SteloAuthConfig;
    /** Discord webhook URL notified when Stelo auth fails and a human must re-authenticate; `null` only logs. */
    authAlertWebhook: string | null;
    /** Keyed by escrowed bounty currency id. */
    currencies: Record<string, SteloCurrencyConfig>;
    /** Prefix of every transfer ref (idempotency key and start of the memo); distinct per deployment. */
    refPrefix: string;
    /** Sweep cadence for payouts to payees. */
    payoutIntervalMs: number;
    /** Smallest amount (whole units) a sweep will pay out. */
    minPayout: number;
    /** Funding-failure backoff: first delay, doubling up to the max. */
    retryBaseMs: number;
    retryMaxMs: number;
}

export interface BotConfig {
    /** prism's `relay-module` — the read-mirror of BitCraft. Always required. */
    prism: SpacetimeTarget;
    /**
     * brico's own module. `null` disables the second connection entirely.
     */
    bricoApp: SpacetimeTarget | null;
    /** Stelo escrow for `stelo-hex-coin`-style currencies. `null` disables the third connection and every funding/payout step. */
    stelo: SteloConfig | null;
    /** How long row changes are coalesced before changed crafts are re-matched against the watches. */
    snapshotIntervalMs: number;
    /** How often the incremental row cache is compared against a full table read. 0 disables. */
    reconcileIntervalMs: number;
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
    /** CDN origin that `iconAssetName` sprite paths resolve against (same as the frontend's `getAssetURL`). */
    assetCdnBase: string;
    /** Host/port the BitAuth/Discord link callback HTTP server binds. */
    httpHost: string;
    httpPort: number;
    /** This process's public origin (e.g. `https://bot.brico.app`), used for redirect URIs and icon URLs. */
    httpBaseUrl: string;
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
    /** `null` disables the Discord bot (interactions route 503s, no REST client). */
    discordBot: DiscordBotConfig | null;
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

/** `null` unless token, public key and application id are all set. */
function discordBotConfig(): DiscordBotConfig | null {
    const token = optionalStr("DISCORD_BOT_TOKEN");
    const publicKey = optionalStr("DISCORD_PUBLIC_KEY");
    const applicationId = optionalStr("DISCORD_APPLICATION_ID");
    if (token === null || publicKey === null || applicationId === null) return null;
    return {
        token,
        publicKey,
        applicationId,
        testGuildId: optionalStr("DISCORD_TEST_GUILD_ID"),
        installClientSecret: optionalStr("DISCORD_BOT_CLIENT_SECRET"),
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

/** Parses `STELO_CURRENCIES`; every key must be an escrowed bounty currency and every rollover target a manually recorded one. */
export function parseSteloCurrencies(raw: string): Record<string, SteloCurrencyConfig> {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("STELO_CURRENCIES must be a JSON object keyed by currency id");
    }
    const result: Record<string, SteloCurrencyConfig> = {};
    for (const [currency, value] of Object.entries(parsed as Record<string, any>)) {
        if (!ESCROWED_BOUNTY_CURRENCIES.includes(currency)) {
            throw new Error(`STELO_CURRENCIES: "${currency}" is not an escrowed bounty currency`);
        }
        if (typeof value?.ledger !== "string" || value.ledger === "") throw new Error(`STELO_CURRENCIES.${currency}.ledger is required`);
        if (!/^\d+$/.test(String(value.escrowAccountId ?? ""))) throw new Error(`STELO_CURRENCIES.${currency}.escrowAccountId must be an account id`);
        const unclaimed = value.unclaimed;
        const afterDays = Number(unclaimed?.afterDays);
        if (!Number.isFinite(afterDays) || afterDays < 0) throw new Error(`STELO_CURRENCIES.${currency}.unclaimed.afterDays must be a non-negative number`);
        let policy: UnclaimedPolicy;
        if (unclaimed.action === "rollover") {
            if (!MANUALLY_RECORDED_BOUNTY_CURRENCIES.includes(unclaimed.to)) {
                throw new Error(`STELO_CURRENCIES.${currency}.unclaimed.to must be a manually recorded currency`);
            }
            policy = {action: "rollover", to: unclaimed.to, afterDays};
        } else if (unclaimed.action === "refund") {
            policy = {action: "refund", afterDays};
        } else {
            throw new Error(`STELO_CURRENCIES.${currency}.unclaimed.action must be "rollover" or "refund"`);
        }
        result[currency] = {ledger: value.ledger, escrowAccountId: BigInt(String(value.escrowAccountId)), unclaimed: policy};
    }
    return result;
}

function steloAuthConfig(): SteloAuthConfig {
    const mode = str("STELO_AUTH_MODE", "permanent");
    if (mode === "permanent") return {mode};
    if (mode !== "refresh") throw new Error(`STELO_AUTH_MODE must be permanent|refresh, got ${JSON.stringify(mode)}`);
    return {
        mode,
        authority: str("STELO_AUTH_AUTHORITY", "https://auth.spacetimedb.com/oidc"),
        clientId: str("STELO_AUTH_CLIENT_ID", "client_033wW7fObq5GPPc4ESCFsF"),
        refreshIntervalMs: int("STELO_AUTH_REFRESH_MS", 12 * 60 * 60 * 1000),
    };
}

function steloConfig(): SteloConfig | null {
    if (!bool("STELO_ENABLED", false)) return null;
    const currencies = parseSteloCurrencies(optionalStr("STELO_CURRENCIES") ?? "{}");
    if (Object.keys(currencies).length === 0) throw new Error("STELO_ENABLED needs STELO_CURRENCIES to name at least one currency");
    const refPrefix = str("STELO_REF_PREFIX", "bx");
    if (!/^[a-z0-9]{1,8}$/i.test(refPrefix)) throw new Error("STELO_REF_PREFIX must be 1-8 letters or digits");
    return {
        target: {
            label: "stelo",
            uri: str("STELO_HOST", "https://maincloud.spacetimedb.com"),
            database: str("STELO_MODULE", "stelofinance"),
        },
        auth: steloAuthConfig(),
        authAlertWebhook: optionalStr("STELO_AUTH_ALERT_WEBHOOK"),
        currencies,
        refPrefix,
        payoutIntervalMs: int("STELO_PAYOUT_INTERVAL_MS", 24 * 60 * 60 * 1000),
        minPayout: int("STELO_MIN_PAYOUT", 1),
        retryBaseMs: int("STELO_RETRY_BASE_MS", 30_000),
        retryMaxMs: int("STELO_RETRY_MAX_MS", 30 * 60 * 1000),
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
        stelo: steloConfig(),
        snapshotIntervalMs: int("BRICO_BOT_SNAPSHOT_INTERVAL_MS", 1000),
        reconcileIntervalMs: int("BRICO_BOT_RECONCILE_INTERVAL_MS", 300_000),
        reconnectDelayMs: int("BRICO_BOT_RECONNECT_DELAY_MS", 5000),
        reconnectMaxDelayMs: int("BRICO_BOT_RECONNECT_MAX_DELAY_MS", 60_000),
        stateDir,
        logLevel: logLevel(),
        heartbeatMs: int("BRICO_BOT_HEARTBEAT_MS", 60_000),
        gameDataDir: path.resolve(PACKAGE_ROOT, str("BRICO_BOT_GAME_DATA_DIR", "../../frontend/public/bsatn/static")),
        assetCdnBase: str("BRICO_ASSET_CDN_BASE", "https://cdn.brico.app"),
        httpHost,
        httpPort,
        httpBaseUrl,
        linkReturnUrl: str("BRICO_BOT_LINK_RETURN_URL", "https://brico.app/account/profile"),
        linkReturnUrlAllowedOrigins: (optionalStr("BRICO_BOT_LINK_RETURN_URL_ALLOWED_ORIGINS") ?? "")
            .split(",")
            .map(origin => origin.trim())
            .filter(origin => origin !== ""),
        bitauth: bitAuthConfig(httpBaseUrl),
        discordOAuth: discordOAuthConfig(httpBaseUrl),
        discordBot: discordBotConfig(),
    };
}
