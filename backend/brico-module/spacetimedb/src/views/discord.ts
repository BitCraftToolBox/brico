// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {discord_guild_install, discord_notify_sink, discord_notify_target, discord_watch_display} from '../tables/discord';

/** The caller's own watch displays, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myDiscordWatchDisplay = spacetimedb.view(
    {name: 'my_discord_watch_display', public: true},
    t.array(discord_watch_display.rowType),
    ctx => ctx.from.discord_watch_display.where(d => d.accountIdentity.eq(ctx.sender))
);

/** Unfiltered watch-display feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allDiscordWatchDisplay = spacetimedb.view(
    {name: 'all_discord_watch_display', public: true},
    t.array(discord_watch_display.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.discord_watch_display.where(_ => isTrusted);
    }
);

/** The caller's own linked Discord notification sinks, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myDiscordNotifySink = spacetimedb.view(
    {name: 'my_discord_notify_sink', public: true},
    t.array(discord_notify_sink.rowType),
    ctx => ctx.from.discord_notify_sink.where(d => d.accountIdentity.eq(ctx.sender))
);

/** Unfiltered notify-sink feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allDiscordNotifySink = spacetimedb.view(
    {name: 'all_discord_notify_sink', public: true},
    t.array(discord_notify_sink.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.discord_notify_sink.where(_ => isTrusted);
    }
);

/** The caller's own Discord notification targets, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myDiscordNotifyTarget = spacetimedb.view(
    {name: 'my_discord_notify_target', public: true},
    t.array(discord_notify_target.rowType),
    ctx => ctx.from.discord_notify_target.where(d => d.accountIdentity.eq(ctx.sender))
);

/** Unfiltered notify-target feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allDiscordNotifyTarget = spacetimedb.view(
    {name: 'all_discord_notify_target', public: true},
    t.array(discord_notify_target.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.discord_notify_target.where(_ => isTrusted);
    }
);

/** Unfiltered guild-install feed for brico-bot. No `my_*` counterpart: the table is guild-scoped. */
export const allDiscordGuildInstall = spacetimedb.view(
    {name: 'all_discord_guild_install', public: true},
    t.array(discord_guild_install.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.discord_guild_install.where(_ => isTrusted);
    }
);
