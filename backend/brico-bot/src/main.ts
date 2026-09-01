/**
 * main.ts — brico-bot's entrypoint.
 *
 * A long-running process: it dials two SpacetimeDB modules, keeps them alive, and runs the shared
 * filter engine over the join.
 *
 * The BitAuth/Discord link HTTP server below (`createLinkHttpServer`) is a consumer of the
 * `brico-app` connection, not of the bridge, so it starts and stops independently of the
 * relay/watch-matching machinery. A future Discord bot or report HTTP API attaches the same way:
 * each is a *consumer* of an existing connection, started after it and shut down with it.
 */
import {createBountyEngine} from "./app/bounty-sink.ts";
import {startBricoAppConnection} from "./app/connection.ts";
import {createNotificationSink} from "./app/notification-sink.ts";
import {createAccountWatchSource} from "./app/watch-source.ts";
import {createDiscordOAuthClient} from "./auth/discord-oauth.ts";
import {createOidcClient} from "./auth/oidc-client.ts";
import {combineSinks, createBridge, createLoggingSink} from "./bridge.ts";
import {loadConfig, loadEnvFile} from "./config.ts";
import {loadRecipeIndex} from "./game-data/recipes.ts";
import {createLinkHttpServer} from "./http-server.ts";
import {createLogger} from "./log.ts";
import {timeReducerCall} from "./metrics.ts";
import {createPrismRelay} from "./relay/prism.ts";
import {createFileTokenStore} from "./spacetime/token-store.ts";

async function main(): Promise<void> {
    const envFile = loadEnvFile();
    const config = loadConfig();
    const log = createLogger(config.logLevel);

    if (envFile) log.info("loaded env file", {file: envFile});
    log.info("starting brico-bot bridge worker", {
        node: process.version,
        prism: `${config.prism.uri}/${config.prism.database}`,
        bricoApp: config.bricoApp ? `${config.bricoApp.uri}/${config.bricoApp.database}` : "(disabled)",
        snapshotIntervalMs: config.snapshotIntervalMs,
        stateDir: config.stateDir,
        gameDataDir: config.gameDataDir,
    });

    // Loaded once, up front, and fatal on failure: every craft's `effortRequired`/`skill`/`tier`/
    // `item` is derived from this, so a bridge that started matching without it would silently
    // treat every craft as effort-0 and item-less rather than failing loudly.
    const recipes = await loadRecipeIndex(config.gameDataDir);
    log.info("loaded static recipe data", {gameDataDir: config.gameDataDir, recipes: recipes.size});

    const tokens = createFileTokenStore(config.stateDir);
    const supervisor = {
        tokens,
        log,
        delayMs: config.reconnectDelayMs,
        maxDelayMs: config.reconnectMaxDelayMs,
    };

    // The brico-app connection comes up first so the watch source can consult it from the very
    // first prism snapshot. Non-blocking — the socket dials in the background — and an unreachable
    // or disabled brico-app leaves the prism half of the bridge entirely untouched.
    const app = startBricoAppConnection({
        ...supervisor,
        target: config.bricoApp,
        onRowsChanged: () => log.debug("brico-app rows changed"),
    });
    if (app.disabledReason) log.warn("brico-app half of the bridge is not running", {reason: app.disabledReason});

    // The BitAuth/Discord OAuth relying-party HTTP surface. Independent of the bridge/watch
    // matching below; it only ever calls `noteIntegrationLinkExternal` on the same `brico-app`
    // connection.
    const bitauthClient = config.bitauth
        ? createOidcClient({
            issuer: config.bitauth.issuer,
            clientId: config.bitauth.clientId,
            clientSecret: config.bitauth.clientSecret,
            redirectUri: config.bitauth.redirectUri,
            scope: config.bitauth.scope,
        })
        : null;
    const discordOAuthClient = config.discordOAuth ? createDiscordOAuthClient(config.discordOAuth) : null;
    if (!bitauthClient) log.warn("BitAuth linking is disabled — set BITAUTH_CLIENT_ID/BITAUTH_CLIENT_SECRET to enable it");
    if (!discordOAuthClient) log.warn("Discord OAuth linking is disabled — set DISCORD_OAUTH_CLIENT_ID/DISCORD_OAUTH_CLIENT_SECRET to enable it");

    const linkHttp = createLinkHttpServer({
        host: config.httpHost,
        port: config.httpPort,
        log: log.child("http"),
        returnUrl: config.linkReturnUrl,
        returnUrlAllowedOrigins: config.linkReturnUrlAllowedOrigins,
        bitauth: bitauthClient,
        discordOAuth: discordOAuthClient,
        noteExternalLink: async ({code, externalId, externalHandle}) => {
            const conn = app.connection?.connection;
            if (!conn) throw new Error("brico-app connection is not live");
            await timeReducerCall("note_integration_link_external", conn.reducers.noteIntegrationLinkExternal({code, externalId, externalHandle}));
        },
    });
    linkHttp.start();

    const watches = createAccountWatchSource(app, log.child("watches"));

    const bridge = createBridge({
        log,
        watches,
        sink: combineSinks(createLoggingSink(log), createNotificationSink(app, log)),
        recipes,
        bounty: createBountyEngine(app, log),
    });

    const relay = createPrismRelay({
        ...supervisor,
        target: config.prism,
        snapshotIntervalMs: config.snapshotIntervalMs,
        onSnapshot: snapshot => bridge.onSnapshot(snapshot),
    });
    relay.start();

    const heartbeat = config.heartbeatMs > 0
        ? setInterval(() => {
            log.info(`heartbeat prism=${relay.connection.status} bricoApp=${app.connection?.status ?? "disabled"} ${bridge.describe()}`);
        }, config.heartbeatMs)
        : null;

    let shuttingDown = false;
    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info("shutting down", {signal, summary: bridge.describe()});
        if (heartbeat) clearInterval(heartbeat);
        linkHttp.stop();
        relay.stop();
        app.stop();
        // Give the SDK's close frames a moment, then exit rather than trusting every handle to be
        // released — a bridge worker that hangs on SIGTERM gets SIGKILLed by its supervisor anyway.
        setTimeout(() => process.exit(0), 250).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // A rejected promise inside an SDK callback must not silently leave the bridge half-alive.
    process.on("unhandledRejection", reason => {
        log.error("unhandled rejection", {error: reason instanceof Error ? reason.stack ?? reason.message : String(reason)});
    });
}

main().catch(cause => {
    console.error(cause);
    process.exit(1);
});
