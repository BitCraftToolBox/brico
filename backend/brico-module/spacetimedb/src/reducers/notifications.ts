// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {spacetimedb} from '../schema';
import {CraftNotificationPayload} from '../tables/notifications';

// ---------------------------------------------------------------------------
// Generic notifications, craft-sourced
// ---------------------------------------------------------------------------

const CRAFT_NOTIFICATION_EVENT_KINDS = new Set(['added', 'finished', 'removed']);

/**
 * Written by `brico-bot` once a watch fires (`notification-sink.ts`). Kept as the one
 * craft-specific entry point; a future watchable type gets its own `postXNotification`
 * reducer, all inserting into this same `notification` table.
 */
export const postCraftNotification = spacetimedb.reducer(
    {accountIdentity: t.identity(), payload: CraftNotificationPayload},
    (ctx, {accountIdentity, payload}) => {
        requireServicePrincipal(ctx);
        if (!CRAFT_NOTIFICATION_EVENT_KINDS.has(payload.eventKind)) {
            throw new SenderError(`${CraftError.UNKNOWN_EVENT_KIND}:${payload.eventKind}`);
        }
        if (ctx.db.account.identity.find(accountIdentity) === null) {
            throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);
        }

        ctx.db.notification.insert({
            id: 0n,
            accountIdentity,
            payload: {tag: 'craft', value: payload},
            createdAt: ctx.timestamp,
            readAt: undefined,
        });
    }
);

/** Marks one notification read. Callable by its owner or by brico-bot, modeled on `unlinkIntegration`. */
export const markNotificationRead = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        const row = ctx.db.notification.id.find(id);
        if (row === null) return;
        if (!row.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
        if (row.readAt !== undefined) return;
        ctx.db.notification.id.update({...row, readAt: ctx.timestamp});
    }
);

/** Marks every one of the caller's own notifications read. */
export const markAllNotificationsRead = spacetimedb.reducer(ctx => {
    requireAccount(ctx);
    for (const row of ctx.db.notification.accountIdentity.filter(ctx.sender)) {
        if (row.readAt === undefined) {
            ctx.db.notification.id.update({...row, readAt: ctx.timestamp});
        }
    }
});

/** Hard-deletes one or more notifications. */
export const deleteNotification = spacetimedb.reducer(
    {ids: t.array(t.u64())},
    (ctx, {ids}) => {
        for (const id of ids) {
            const row = ctx.db.notification.id.find(id);
            if (row === null) continue;
            if (!row.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
            ctx.db.notification.id.delete(id);
        }
    }
);
