// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount} from '../lib/auth';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import {spacetimedb} from '../schema';
import {NotifySinkRef} from '../tables/notify';

/**
 * Creates or edits the caller's trigger for one (filter, sink). Existing rows are found by scanning
 * the caller's rows, since there is no index over the sink sum type.
 */
export const upsertCraftFilterNotifyTrigger = spacetimedb.reducer(
    {
        id: t.string(),
        filterId: t.string(),
        sink: NotifySinkRef,
        added: t.bool(),
        finished: t.bool(),
        removed: t.bool(),
        updatedAt: t.timestamp(),
    },
    (ctx, {id, filterId, sink, added, finished, removed, updatedAt}) => {
        requireAccount(ctx);

        const filter = ctx.db.saved_craft_filter.id.find(filterId);
        if (filter === null || !filter.accountIdentity.isEqual(ctx.sender) || filter.deletedAt !== undefined) {
            throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER_FOR_NOTIFY);
        }
        if (sink.tag === 'discord') {
            const discordSink = ctx.db.discord_notify_sink.id.find(sink.value.sinkId);
            if (discordSink === null || !discordSink.accountIdentity.isEqual(ctx.sender) || discordSink.deletedAt !== undefined) {
                throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
            }
        }

        let existing = null;
        for (const row of ctx.db.craft_filter_notify_trigger.accountIdentity.filter(ctx.sender)) {
            if (row.filterId !== filterId || row.deletedAt !== undefined) continue;
            if (row.sink.tag !== sink.tag) continue;
            if (row.sink.tag === 'discord' && sink.tag === 'discord' && row.sink.value.sinkId !== sink.value.sinkId) continue;
            existing = row;
            break;
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.craft_filter_notify_trigger.insert({
                id,
                accountIdentity: ctx.sender,
                filterId,
                sink,
                added,
                finished,
                removed,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        } else {
            ctx.db.craft_filter_notify_trigger.id.update({
                ...existing,
                added,
                finished,
                removed,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        }
    }
);

/** Tombstones the caller's own trigger row (no hard delete). Silent no-op if already gone. */
export const detachCraftFilterNotifyTrigger = spacetimedb.reducer(
    {id: t.string(), deletedAt: t.timestamp()},
    (ctx, {id, deletedAt}) => {
        requireAccount(ctx);
        const existing = ctx.db.craft_filter_notify_trigger.id.find(id);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.CRAFT_FILTER_NOTIFY_TRIGGER_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedDeletedAt = clampClientTimestamp(ctx, deletedAt);
        if (!isAtLeastAsNew(clampedDeletedAt, existing.updatedAt)) return;

        ctx.db.craft_filter_notify_trigger.id.update({...existing, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});
    }
);
