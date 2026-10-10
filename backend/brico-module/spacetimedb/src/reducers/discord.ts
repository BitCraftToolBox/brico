// noinspection JSUnusedGlobalSymbols

import {
    isDiscordDisplayFieldPresetKey,
    isDiscordDisplaySortDirection,
    isDiscordDisplaySortField,
    isDiscordDisplayStyle,
    MAX_DISPLAY_REFRESH_SECONDS,
    MAX_DISPLAY_ROWS_HARD_CAP,
    MAX_STICKY_MINUTES,
    MIN_DISPLAY_REFRESH_SECONDS,
    MIN_STICKY_MINUTES,
} from '@brico/crafts/discord-display';
import {isDiscordCommandMode} from '@brico/crafts/discord-guild';
import {CraftError, MAX_DISPLAY_TEMPLATE_LENGTH, MAX_NOTIFY_TEMPLATE_LENGTH} from '@brico/crafts/errors';
import type {Infer} from 'spacetimedb/server';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import {spacetimedb} from '../schema';
import {DiscordWatchDisplayContent} from '../tables/discord';

/** Presets must all be known keys; a template is checked for length only. */
function validateContent(content: Infer<typeof DiscordWatchDisplayContent>): void {
    if (content.tag === 'presets') {
        for (const preset of content.value.presets) {
            if (!isDiscordDisplayFieldPresetKey(preset)) {
                throw new SenderError(`${CraftError.UNKNOWN_FIELD_PRESET}:${preset}`);
            }
        }
    } else if (content.value.template.length > MAX_DISPLAY_TEMPLATE_LENGTH) {
        throw new SenderError(CraftError.DISPLAY_TEMPLATE_TOO_LONG);
    }
}

/**
 * Creates or edits a watch display, upserted by `(accountIdentity, filterId, channelId)`. Service
 * principal only; `accountIdentity` is the filter owner. `id` is caller-generated (reducers must be
 * deterministic) and used only on insert; `shareCode` is stored as given on both paths.
 */
export const attachDiscordWatchDisplay = spacetimedb.reducer(
    {
        id: t.string(),
        accountIdentity: t.identity(),
        filterId: t.string(),
        channelId: t.string(),
        content: DiscordWatchDisplayContent,
        style: t.string(),
        sortField: t.string(),
        sortDirection: t.string(),
        limit: t.u32(),
        stickyMinutes: t.u32(),
        refreshIntervalSeconds: t.u32(),
        shareCode: t.option(t.string()),
    },
    (ctx, {id, accountIdentity, filterId, channelId, content, style, sortField, sortDirection, limit, stickyMinutes, refreshIntervalSeconds, shareCode}) => {
        requireServicePrincipal(ctx);

        const filter = ctx.db.saved_craft_filter.id.find(filterId);
        if (filter === null || !filter.accountIdentity.isEqual(accountIdentity) || filter.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER_FOR_DISPLAY);
        }
        validateContent(content);
        if (!isDiscordDisplayStyle(style)) {
            throw new SenderError(`${CraftError.UNKNOWN_DISPLAY_STYLE}:${style}`);
        }
        if (!isDiscordDisplaySortField(sortField)) {
            throw new SenderError(`${CraftError.UNKNOWN_SORT_FIELD}:${sortField}`);
        }
        if (!isDiscordDisplaySortDirection(sortDirection)) {
            throw new SenderError(`${CraftError.UNKNOWN_SORT_DIRECTION}:${sortDirection}`);
        }
        if (limit < 1 || limit > MAX_DISPLAY_ROWS_HARD_CAP) {
            throw new SenderError(CraftError.DISPLAY_LIMIT_TOO_LARGE);
        }
        if (stickyMinutes < MIN_STICKY_MINUTES || stickyMinutes > MAX_STICKY_MINUTES) {
            throw new SenderError(CraftError.STICKY_MINUTES_OUT_OF_RANGE);
        }
        if (refreshIntervalSeconds < MIN_DISPLAY_REFRESH_SECONDS || refreshIntervalSeconds > MAX_DISPLAY_REFRESH_SECONDS) {
            throw new SenderError(CraftError.DISPLAY_REFRESH_OUT_OF_RANGE);
        }

        let existing = null;
        for (const row of ctx.db.discord_watch_display.accountIdentity.filter(accountIdentity)) {
            if (row.filterId === filterId && row.channelId === channelId && row.deletedAt === undefined) {
                existing = row;
                break;
            }
        }

        if (existing === null) {
            ctx.db.discord_watch_display.insert({
                id,
                accountIdentity,
                filterId,
                channelId,
                content,
                style,
                sortField,
                sortDirection,
                limit,
                stickyMinutes,
                refreshIntervalSeconds,
                shareCode,
                messageId: undefined,
                lastPostedAt: undefined,
                lastEditedAt: undefined,
                createdAt: ctx.timestamp,
                updatedAt: ctx.timestamp,
                deletedAt: undefined,
            });
        } else {
            ctx.db.discord_watch_display.id.update({
                ...existing,
                content,
                style,
                sortField,
                sortDirection,
                limit,
                stickyMinutes,
                refreshIntervalSeconds,
                shareCode,
                updatedAt: ctx.timestamp,
            });
        }
    }
);

/** Tombstones a watch display. Service principal only. */
export const detachDiscordWatchDisplay = spacetimedb.reducer(
    {id: t.string()},
    (ctx, {id}) => {
        requireServicePrincipal(ctx);
        const existing = ctx.db.discord_watch_display.id.find(id);
        if (existing === null || existing.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_DISCORD_WATCH_DISPLAY);
        }
        ctx.db.discord_watch_display.id.update({...existing, updatedAt: ctx.timestamp, deletedAt: ctx.timestamp});
    }
);

/**
 * Records the message `brico-bot` just posted. `edited` distinguishes a PATCH of the existing message
 * (bumps `lastEditedAt` only) from a fresh POST (bumps `lastPostedAt`, resets `lastEditedAt`).
 */
export const setDiscordWatchDisplayMessage = spacetimedb.reducer(
    {id: t.string(), messageId: t.string(), postedAt: t.timestamp(), edited: t.bool()},
    (ctx, {id, messageId, postedAt, edited}) => {
        requireServicePrincipal(ctx);
        const existing = ctx.db.discord_watch_display.id.find(id);
        if (existing === null) throw new SenderError(CraftError.UNKNOWN_DISCORD_WATCH_DISPLAY);
        ctx.db.discord_watch_display.id.update({
            ...existing,
            messageId,
            lastPostedAt: edited ? existing.lastPostedAt : postedAt,
            lastEditedAt: edited ? postedAt : undefined,
        });
    }
);

/**
 * Creates or edits a Discord notification sink, upserted by `(accountIdentity, channelId)`. Service
 * principal only; `id` is used only on insert.
 */
export const attachDiscordNotifySink = spacetimedb.reducer(
    {
        id: t.string(),
        accountIdentity: t.identity(),
        channelId: t.string(),
        channelName: t.option(t.string()),
        defaultMentionType: t.option(t.string()),
        defaultMentionId: t.option(t.string()),
        defaultMentionName: t.option(t.string()),
    },
    (ctx, {id, accountIdentity, channelId, channelName, defaultMentionType, defaultMentionId, defaultMentionName}) => {
        requireServicePrincipal(ctx);

        let existing = null;
        for (const row of ctx.db.discord_notify_sink.accountIdentity.filter(accountIdentity)) {
            if (row.channelId === channelId && row.deletedAt === undefined) {
                existing = row;
                break;
            }
        }

        if (existing === null) {
            ctx.db.discord_notify_sink.insert({
                id,
                accountIdentity,
                channelId,
                channelName,
                defaultMentionType,
                defaultMentionId,
                defaultMentionName,
                createdAt: ctx.timestamp,
                updatedAt: ctx.timestamp,
                deletedAt: undefined,
            });
        } else {
            ctx.db.discord_notify_sink.id.update({
                ...existing,
                channelName,
                defaultMentionType,
                defaultMentionId,
                defaultMentionName,
                updatedAt: ctx.timestamp,
            });
        }
    }
);

/** Tombstones a notification sink. Callable by the owner or a service principal, like `unlinkIntegration`. */
export const detachDiscordNotifySink = spacetimedb.reducer(
    {id: t.string()},
    (ctx, {id}) => {
        const existing = ctx.db.discord_notify_sink.id.find(id);
        if (existing === null || existing.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
        }
        if (!existing.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
        ctx.db.discord_notify_sink.id.update({...existing, updatedAt: ctx.timestamp, deletedAt: ctx.timestamp});
    }
);

function validateNotifyTemplateLength(template: string): void {
    if (template.length > MAX_NOTIFY_TEMPLATE_LENGTH) throw new SenderError(CraftError.NOTIFY_TEMPLATE_TOO_LONG);
}

/** Trims the template; empty stores as `undefined` (use the default). */
function storedTemplate(value: string): string | undefined {
    value = value.trim();
    return value.length > 0 ? value : undefined;
}

/**
 * Self-service edit of a Discord target's per-event wording. Never touches `mention*` (bot-set) or
 * `craft_filter_notify_trigger`.
 */
export const upsertDiscordNotifyTargetTemplate = spacetimedb.reducer(
    {
        id: t.string(),
        filterId: t.string(),
        discordSinkId: t.string(),
        addedTemplate: t.string(),
        finishedTemplate: t.string(),
        removedTemplate: t.string(),
        updatedAt: t.timestamp(),
    },
    (ctx, {id, filterId, discordSinkId, addedTemplate, finishedTemplate, removedTemplate, updatedAt}) => {
        requireAccount(ctx);

        const filter = ctx.db.saved_craft_filter.id.find(filterId);
        if (filter === null || !filter.accountIdentity.isEqual(ctx.sender) || filter.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER_FOR_NOTIFY);
        }
        const sink = ctx.db.discord_notify_sink.id.find(discordSinkId);
        if (sink === null || !sink.accountIdentity.isEqual(ctx.sender) || sink.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
        }
        validateNotifyTemplateLength(addedTemplate);
        validateNotifyTemplateLength(finishedTemplate);
        validateNotifyTemplateLength(removedTemplate);

        let existing = null;
        for (const row of ctx.db.discord_notify_target.accountIdentity.filter(ctx.sender)) {
            if (row.filterId === filterId && row.sinkId === discordSinkId && row.deletedAt === undefined) {
                existing = row;
                break;
            }
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        const addedStored = storedTemplate(addedTemplate);
        const finishedStored = storedTemplate(finishedTemplate);
        const removedStored = storedTemplate(removedTemplate);

        if (existing === null) {
            ctx.db.discord_notify_target.insert({
                id,
                accountIdentity: ctx.sender,
                filterId,
                sinkId: discordSinkId,
                addedTemplate: addedStored,
                finishedTemplate: finishedStored,
                removedTemplate: removedStored,
                mentionType: undefined,
                mentionId: undefined,
                mentionName: undefined,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        } else {
            ctx.db.discord_notify_target.id.update({
                ...existing,
                addedTemplate: addedStored,
                finishedTemplate: finishedStored,
                removedTemplate: removedStored,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        }
    }
);

/** Tombstones the caller's own Discord target. Silent no-op if already gone. */
export const detachDiscordNotifyTarget = spacetimedb.reducer(
    {id: t.string(), deletedAt: t.timestamp()},
    (ctx, {id, deletedAt}) => {
        requireAccount(ctx);
        const existing = ctx.db.discord_notify_target.id.find(id);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.DISCORD_NOTIFY_TARGET_BELONGS_TO_ANOTHER_ACCOUNT);
        }
        const clampedDeletedAt = clampClientTimestamp(ctx, deletedAt);
        if (!isAtLeastAsNew(clampedDeletedAt, existing.updatedAt)) return;
        ctx.db.discord_notify_target.id.update({...existing, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});
    }
);

/**
 * Service-principal writer for `/watch notify-setup`: upserts the `discord_notify_target` row
 * (including `mention*`) and the matching `craft_filter_notify_trigger` row by
 * `(accountIdentity, filterId, discordSinkId)`. Each trigger bool is on iff its template is
 * non-empty. `id` is used for whichever row(s) get inserted.
 */
export const attachDiscordNotifyTarget = spacetimedb.reducer(
    {
        id: t.string(),
        accountIdentity: t.identity(),
        filterId: t.string(),
        discordSinkId: t.string(),
        addedTemplate: t.string(),
        finishedTemplate: t.string(),
        removedTemplate: t.string(),
        mentionType: t.option(t.string()),
        mentionId: t.option(t.string()),
        mentionName: t.option(t.string()),
    },
    (ctx, {id, accountIdentity, filterId, discordSinkId, addedTemplate, finishedTemplate, removedTemplate, mentionType, mentionId, mentionName}) => {
        requireServicePrincipal(ctx);

        const filter = ctx.db.saved_craft_filter.id.find(filterId);
        if (filter === null || !filter.accountIdentity.isEqual(accountIdentity) || filter.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER_FOR_NOTIFY);
        }
        const sink = ctx.db.discord_notify_sink.id.find(discordSinkId);
        if (sink === null || !sink.accountIdentity.isEqual(accountIdentity) || sink.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
        }
        validateNotifyTemplateLength(addedTemplate);
        validateNotifyTemplateLength(finishedTemplate);
        validateNotifyTemplateLength(removedTemplate);

        const addedStored = storedTemplate(addedTemplate);
        const finishedStored = storedTemplate(finishedTemplate);
        const removedStored = storedTemplate(removedTemplate);

        let existingTarget = null;
        for (const row of ctx.db.discord_notify_target.accountIdentity.filter(accountIdentity)) {
            if (row.filterId === filterId && row.sinkId === discordSinkId && row.deletedAt === undefined) {
                existingTarget = row;
                break;
            }
        }

        if (existingTarget === null) {
            ctx.db.discord_notify_target.insert({
                id,
                accountIdentity,
                filterId,
                sinkId: discordSinkId,
                addedTemplate: addedStored,
                finishedTemplate: finishedStored,
                removedTemplate: removedStored,
                mentionType,
                mentionId,
                mentionName,
                updatedAt: ctx.timestamp,
                deletedAt: undefined,
            });
        } else {
            ctx.db.discord_notify_target.id.update({
                ...existingTarget,
                addedTemplate: addedStored,
                finishedTemplate: finishedStored,
                removedTemplate: removedStored,
                mentionType,
                mentionId,
                mentionName,
                updatedAt: ctx.timestamp,
            });
        }

        let existingTrigger = null;
        for (const row of ctx.db.craft_filter_notify_trigger.accountIdentity.filter(accountIdentity)) {
            if (row.filterId === filterId && row.sink.tag === 'discord' && row.sink.value.sinkId === discordSinkId && row.deletedAt === undefined) {
                existingTrigger = row;
                break;
            }
        }

        const added = addedStored !== undefined;
        const finished = finishedStored !== undefined;
        const removed = removedStored !== undefined;

        if (existingTrigger === null) {
            ctx.db.craft_filter_notify_trigger.insert({
                id,
                accountIdentity,
                filterId,
                sink: {tag: 'discord', value: {sinkId: discordSinkId}},
                added,
                finished,
                removed,
                updatedAt: ctx.timestamp,
                deletedAt: undefined,
            });
        } else {
            ctx.db.craft_filter_notify_trigger.id.update({
                ...existingTrigger,
                added,
                finished,
                removed,
                updatedAt: ctx.timestamp,
                deletedAt: undefined,
            });
        }
    }
);

/** Upserts a guild's command layout, keyed on `guildId`. Service principal only. */
export const upsertDiscordGuildInstall = spacetimedb.reducer(
    {guildId: t.string(), commandMode: t.string()},
    (ctx, {guildId, commandMode}) => {
        requireServicePrincipal(ctx);
        if (!isDiscordCommandMode(commandMode)) {
            throw new SenderError(`${CraftError.UNKNOWN_COMMAND_MODE}:${commandMode}`);
        }

        const existing = ctx.db.discord_guild_install.guildId.find(guildId);
        if (existing === null) {
            ctx.db.discord_guild_install.insert({guildId, commandMode, createdAt: ctx.timestamp, updatedAt: ctx.timestamp});
        } else {
            ctx.db.discord_guild_install.guildId.update({...existing, commandMode, updatedAt: ctx.timestamp});
        }
    }
);
