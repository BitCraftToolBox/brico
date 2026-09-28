import {t, table} from 'spacetimedb/server';

/**
 * Which sink a `craft_filter_notify_trigger` row is for. `toast` is the implicit single in-site sink;
 * `discord` carries the `discord_notify_sink.id` it targets.
 */
export const NotifySinkRef = t.enum('NotifySinkRef', {
    toast: t.object('ToastNotifySinkRef', {}),
    discord: t.object('DiscordNotifySinkRef', {sinkId: t.string()}),
});

/**
 * Per-(filter, sink, event) on/off flags for every sink kind. Sink-specific settings (templates,
 * mentions) live in their own tables, e.g. `discord_notify_target`. Self-service: toggling a trigger
 * grants no new channel access.
 */
export const craft_filter_notify_trigger = table(
    {name: 'craft_filter_notify_trigger'},
    {
        id: t.string().primaryKey(), // client- (toast) or bot- (discord) generated uuid
        accountIdentity: t.identity().index('btree'),
        filterId: t.string().index('btree'),
        sink: NotifySinkRef,
        added: t.bool(),
        finished: t.bool(),
        removed: t.bool(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);
