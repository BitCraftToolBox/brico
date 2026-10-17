import {t, table} from 'spacetimedb/server';

/**
 * A display's per-craft content: either field presets (composed into a template by
 * `@brico/crafts/discord-display`) or a raw template string. `template` is validated for length
 * only; an unrecognized `{token}` renders as literal text.
 */
export const DiscordWatchDisplayContent = t.enum('DiscordWatchDisplayContent', {
    presets: t.object('DiscordWatchDisplayPresets', {presets: t.array(t.string())}),
    template: t.object('DiscordWatchDisplayTemplate', {template: t.string()}),
});

/**
 * A periodically-refreshed message showing the first N matches for a saved craft filter, posted to
 * one Discord channel. Written only by `brico-bot` (service principal), which checks the invoking
 * user's channel permissions; `accountIdentity` is the owner of the `saved_craft_filter` it reads.
 * `channelId` is globally unique, so there is no `guildId`.
 */
export const discord_watch_display = table(
    {
        name: 'discord_watch_display',
        indexes: [{accessor: 'by_channel', algorithm: 'btree', columns: ['channelId']}],
    },
    {
        id: t.string().primaryKey(), // bot-generated (crypto.randomUUID())
        accountIdentity: t.identity().index('btree'),
        filterId: t.string(),
        channelId: t.string(),
        content: DiscordWatchDisplayContent,
        style: t.string(), // 'compact' | 'simple' | 'icon'
        sortField: t.string(), // 'remaining' | 'effort' | 'tier' | 'bounty' | 'newest'
        sortDirection: t.string(), // 'asc' | 'desc'
        limit: t.u32(),
        /** Minutes between delete-and-resend (instead of edit-in-place) to keep the message at the bottom of the channel. `0` disables. */
        stickyMinutes: t.u32(),
        refreshIntervalSeconds: t.u32(),
        /** A `shared_filter` code for the footer link, minted once by `brico-bot` and reused across edits. */
        shareCode: t.option(t.string()),
        /** Set by the bot after each (re)post. */
        messageId: t.option(t.string()),
        lastPostedAt: t.option(t.timestamp()),
        lastEditedAt: t.option(t.timestamp()),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * A linked Discord notification destination, one per (account, channel). Filters point at it via
 * `craft_filter_notify_trigger` (`sink: {tag: 'discord', sinkId}`) and `discord_notify_target`.
 * `channelName`/`defaultMentionName` are cached display strings for the web settings page, which has
 * no Discord API access. Created/edited only by `brico-bot` (it checks channel permissions);
 * `detachDiscordNotifySink` is also callable by the owner.
 */
export const discord_notify_sink = table(
    {name: 'discord_notify_sink'},
    {
        id: t.string().primaryKey(), // bot-generated (crypto.randomUUID())
        accountIdentity: t.identity().index('btree'),
        channelId: t.string().index('btree'),
        channelName: t.option(t.string()),
        /** Default mention, used when the `discord_notify_target` has no override. */
        defaultMentionType: t.option(t.string()), // 'user' | 'role'
        defaultMentionId: t.option(t.string()),
        defaultMentionName: t.option(t.string()),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * Discord-specific wording/mention config for one (account, filter, Discord sink) pair; on/off lives
 * in `craft_filter_notify_trigger`. An `undefined` template means the default
 * (`@brico/crafts/discord-notify`'s `DEFAULT_NOTIFY_TEMPLATE`). `mention*` overrides the sink's
 * `defaultMention*` (`undefined` inherits) and is written only by `attachDiscordNotifyTarget`.
 */
export const discord_notify_target = table(
    {name: 'discord_notify_target'},
    {
        id: t.string().primaryKey(), // client- or bot-generated uuid
        accountIdentity: t.identity().index('btree'),
        filterId: t.string(),
        sinkId: t.string(), // discord_notify_sink.id
        addedTemplate: t.option(t.string()),
        finishedTemplate: t.option(t.string()),
        removedTemplate: t.option(t.string()),
        mentionType: t.option(t.string()), // 'user' | 'role'
        mentionId: t.option(t.string()),
        mentionName: t.option(t.string()),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * The command layout (`@brico/crafts/discord-guild`'s `DiscordCommandMode`) a guild last chose,
 * persisted across bot restarts. Not an allow-list: a guild with no row keeps whatever
 * `register-commands.ts` last registered. Written only by `brico-bot`.
 */
export const discord_guild_install = table(
    {name: 'discord_guild_install'},
    {
        guildId: t.string().primaryKey(),
        commandMode: t.string(), // 'flat' | 'grouped'
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
    }
);
