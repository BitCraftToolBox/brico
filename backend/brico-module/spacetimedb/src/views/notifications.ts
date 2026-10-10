import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {notification_v2} from '../tables/notifications';

// noinspection JSUnusedGlobalSymbols
/**
 * The caller's own notifications, read and unread alike (the client decides what to show).
 */
export const myNotification = spacetimedb.view(
    {name: 'my_notification', public: true},
    t.array(notification_v2.rowType),
    ctx => ctx.from.notification_v2.where(n => n.accountIdentity.eq(ctx.sender))
);

// No bot `all_` view, as it never needs to read notifications, only write them.
