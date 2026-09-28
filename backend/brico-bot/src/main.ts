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
import {type BountyEngine, createBountyEngine} from "./app/bounty-sink.ts";
import {startBricoAppConnection} from "./app/connection.ts";
import {createNotificationSink} from "./app/notification-sink.ts";
import {createAccountWatchSource} from "./app/watch-source.ts";
import {createDiscordOAuthClient} from "./auth/discord-oauth.ts";
import {createOidcClient} from "./auth/oidc-client.ts";
import {combineSinks, createBridge, createLoggingSink} from "./bridge.ts";
import {loadConfig, loadEnvFile} from "./config.ts";
import {commands as discordCommands} from "./discord/commands/index.ts";
import {createDisplayManager} from "./discord/display-manager.ts";
import {createIconRenderer} from "./discord/icon-composite.ts";
import {buildDiscordInstallAuthorizeUrl, resolveInstalledGuildId} from "./discord/install.ts";
import {createInteractionsHandler} from "./discord/interactions.ts";
import {createDiscordNotificationSink} from "./discord/notification-sink.ts";
import {registerGuildCommands} from "./discord/register-guild-commands.ts";
import {createDiscordRestClient} from "./discord/rest-client.ts";
import {syncAllGuildCommands} from "./discord/sync-guild-commands.ts";
import {loadItemIconIndex} from "./game-data/item-icons.ts";
import {loadRecipeDisplayIndex, loadRecipeIndex} from "./game-data/recipes.ts";
import {loadSkillNameIndex} from "./game-data/skills.ts";
import {createLinkHttpServer} from "./http-server.ts";
import {createLogger} from "./log.ts";
import {timeReducerCall} from "./metrics.ts";
import {createPrismRelay, type PrismRelay} from "./relay/prism.ts";
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
        discordBot: config.discordBot ? "(enabled)" : "(disabled)",
        snapshotIntervalMs: config.snapshotIntervalMs,
        stateDir: config.stateDir,
        gameDataDir: config.gameDataDir,
    });

    // Loaded once, up front, and fatal on failure: every craft's `effortRequired`/`skill`/`tier`/
    // `item` is derived from this, so a bridge that started matching without it would silently
    // treat every craft as effort-0 and item-less rather than failing loudly.
    const recipes = await loadRecipeIndex(config.gameDataDir);
    log.info("loaded static recipe data", {gameDataDir: config.gameDataDir, recipes: recipes.size});

    // Recipe/skill/icon display data for the Discord features; loaded even when the bot is disabled.
    const recipeNames = await loadRecipeDisplayIndex(config.gameDataDir);

    const skillNames = await loadSkillNameIndex(config.gameDataDir);

    // Backs `GET /icons/:shape/:id.webp`.
    const itemIcons = await loadItemIconIndex(config.gameDataDir);
    const iconRenderer = createIconRenderer(config.assetCdnBase);

    const tokens = createFileTokenStore(config.stateDir);
    const supervisor = {
        tokens,
        log,
        delayMs: config.reconnectDelayMs,
        maxDelayMs: config.reconnectMaxDelayMs,
    };

    // Forward references: `app`'s own callbacks are only ever invoked later (once its socket is
    // live), by which point both `relay`/`bounty` below are already assigned — this lets `app`
    // (constructed first, so the watch source can consult it from the very first prism snapshot)
    // reach `relay.mark()`/`bounty.markLoyaltyRulesChanged()` without restructuring construction order.
    let relay: PrismRelay | undefined;
    let bounty: BountyEngine | undefined;

    // The brico-app connection comes up first so the watch source can consult it from the very
    // first prism snapshot. Non-blocking — the socket dials in the background — and an unreachable
    // or disabled brico-app leaves the prism half of the bridge entirely untouched.
    const app = startBricoAppConnection({
        ...supervisor,
        target: config.bricoApp,
        onRowsChanged: () => {
            log.debug("brico-app rows changed");
            // No second timer: piggyback on prism's own coalesced tick, so a rule/reward edit with
            // no coincidental prism activity still lands within one `snapshotIntervalMs`.
            relay?.mark();
        },
        onLoyaltyRulesChanged: () => bounty?.markLoyaltyRulesChanged(),
        // Forward reference: `discordBot`/`discordRest` are declared below but assigned before the socket is live.
        onReady: () => {
            if (!discordBot || !discordRest) return;
            const conn = app.connection?.connection;
            if (!conn) return;
            void syncAllGuildCommands({rest: discordRest, applicationId: discordBot.applicationId, conn, log: log.child("discord")}).catch(cause => {
                log.error("guild command resync failed", {error: cause instanceof Error ? cause.message : String(cause)});
            });
        },
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

    // Local copy so closures below can narrow it (TS won't narrow `config.discordBot` across them).
    const discordBot = config.discordBot;

    // Shared REST client for all outgoing Discord calls.
    const discordRest = discordBot ? createDiscordRestClient(discordBot.token) : null;

    // Slash commands. No gateway: interactions arrive as signed HTTP POSTs on the HTTP server below.
    const discordInteractions = discordBot && discordRest
        ? createInteractionsHandler({
            publicKey: discordBot.publicKey,
            leaves: discordCommands,
            deps: {
                log: log.child("discord"),
                app,
                linkReturnUrl: config.linkReturnUrl,
                rest: discordRest,
                applicationId: discordBot.applicationId,
            },
            log: log.child("discord"),
        })
        : null;
    if (!discordInteractions) log.warn("Discord bot is disabled — set DISCORD_BOT_TOKEN/DISCORD_PUBLIC_KEY/DISCORD_APPLICATION_ID to enable it");

    // Self-serve install flow. Requires the client secret: the token exchange is how the granted guild
    // is trusted, so the callback's own `guild_id` query param is never used.
    const installClientSecret = discordBot?.installClientSecret ?? null;
    const discordInstall = discordBot && discordRest && installClientSecret
        ? {
            buildAuthorizeUrl: () => buildDiscordInstallAuthorizeUrl({
                applicationId: discordBot.applicationId,
                redirectUri: `${config.httpBaseUrl}/discord/install/callback`,
            }),
            resolveInstalledGuildId: (code: string) => resolveInstalledGuildId({
                applicationId: discordBot.applicationId,
                clientSecret: installClientSecret,
                redirectUri: `${config.httpBaseUrl}/discord/install/callback`,
                code,
            }),
            onInstalled: async ({guildId}: {guildId: string}) => {
                const conn = app.connection?.connection;
                if (!conn) throw new Error("brico-app connection is not live");
                await timeReducerCall("upsert_discord_guild_install", conn.reducers.upsertDiscordGuildInstall({guildId, commandMode: "flat"}));
                await registerGuildCommands(discordRest, discordBot.applicationId, guildId, "flat");
            },
        }
        : null;
    if (discordBot && discordRest && !installClientSecret) {
        log.warn("Discord self-serve install is disabled — set DISCORD_BOT_CLIENT_SECRET to enable /discord/install (the manual invite flow still works without it)");
    }

    // Periodically refreshes `/watch display` messages from the bridge's per-snapshot rows (`onRowsComputed`).
    const displayManager = config.discordBot && discordRest
        ? createDisplayManager({
            app,
            rest: discordRest,
            recipeNames,
            skillNames,
            frontendOrigin: new URL(config.linkReturnUrl).origin,
            botHttpBaseUrl: config.httpBaseUrl,
            assetCdnBase: config.assetCdnBase,
            log: log.child("discord"),
        })
        : null;

    // Discord half of the notification sink; combined with the in-site sink below.
    const discordNotificationSink = config.discordBot && discordRest
        ? createDiscordNotificationSink({
            app,
            rest: discordRest,
            recipeNames,
            skillNames,
            frontendOrigin: new URL(config.linkReturnUrl).origin,
            log: log.child("discord"),
        })
        : null;

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
        discordInteractions,
        discordInstall,
        icons: {index: itemIcons, renderer: iconRenderer},
    });
    linkHttp.start();

    const watches = createAccountWatchSource(app, log.child("watches"));

    bounty = createBountyEngine(app, log);

    const bridge = createBridge({
        log,
        watches,
        sink: combineSinks(
            createLoggingSink(log),
            createNotificationSink(app, log),
            ...(discordNotificationSink ? [discordNotificationSink] : []),
        ),
        recipes,
        bounty,
        onRowsComputed: rows => displayManager?.onRowsComputed(rows),
    });

    relay = createPrismRelay({
        ...supervisor,
        target: config.prism,
        snapshotIntervalMs: config.snapshotIntervalMs,
        onSnapshot: snapshot => bridge.onSnapshot(snapshot),
        onClaimMembershipChanged: () => bounty?.markMembershipChanged(),
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
        displayManager?.stop();
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
