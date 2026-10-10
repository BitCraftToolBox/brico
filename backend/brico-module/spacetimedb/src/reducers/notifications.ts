// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import {encodeNotificationPayload} from '@brico/crafts/notification';
import {FUNDING_NOTIFICATION_KINDS, FUNDING_NOTIFICATION_ROLES, FUNDING_REASONS} from '@brico/crafts/stelo';
import type {Infer} from 'spacetimedb/server';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {isEscrowedCurrency} from '../lib/escrow';
import {spacetimedb} from '../schema';
import {CraftNotificationPayload, FundingNotificationPayload} from '../tables/notifications';

const craftJson = (value: Infer<typeof CraftNotificationPayload>) =>
    encodeNotificationPayload({tag: 'craft', value});

const fundingJson = (value: Infer<typeof FundingNotificationPayload>) =>
    encodeNotificationPayload({
        tag: 'funding',
        value: {...value, craftId: value.craftId?.toString(), amount: value.amount?.toString()},
    });

// ---------------------------------------------------------------------------
// Generic notifications, craft-sourced
// ---------------------------------------------------------------------------

const CRAFT_NOTIFICATION_EVENT_KINDS = new Set(['added', 'finished', 'removed']);

/**
 * Written by `brico-bot` once a watch fires (`notification-sink.ts`). Each notification source
 * has its own `postXNotification` reducer, all inserting into `notification_v2`.
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

        ctx.db.notification_v2.insert({
            id: 0n,
            accountIdentity,
            payloadJson: craftJson(payload),
            createdAt: ctx.timestamp,
            readAt: undefined,
        });
    }
);

/** Marks one notification read. Callable by its owner or by brico-bot, modeled on `unlinkIntegration`. */
export const markNotificationRead = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        const row = ctx.db.notification_v2.id.find(id);
        if (row === null) return;
        if (!row.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
        if (row.readAt !== undefined) return;
        ctx.db.notification_v2.id.update({...row, readAt: ctx.timestamp});
    }
);

/** Marks every one of the caller's own notifications read. */
export const markAllNotificationsRead = spacetimedb.reducer(ctx => {
    requireAccount(ctx);
    for (const row of ctx.db.notification_v2.accountIdentity.filter(ctx.sender)) {
        if (row.readAt === undefined) {
            ctx.db.notification_v2.id.update({...row, readAt: ctx.timestamp});
        }
    }
});

/** Hard-deletes one or more notifications. */
export const deleteNotification = spacetimedb.reducer(
    {ids: t.array(t.u64())},
    (ctx, {ids}) => {
        for (const id of ids) {
            const row = ctx.db.notification_v2.id.find(id);
            if (row === null) continue;
            if (!row.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
            ctx.db.notification_v2.id.delete(id);
        }
    }
);

/**
 * Moves every legacy `notification` row into `notification_v2` (JSON payload, same timestamps and
 * read state) and deletes it. Idempotent; a no-op once the legacy table is empty.
 */
export const migrateNotificationsToV2 = spacetimedb.reducer(ctx => {
    requireServicePrincipal(ctx);
    for (const row of ctx.db.notification.iter()) {
        ctx.db.notification_v2.insert({
            id: 0n,
            accountIdentity: row.accountIdentity,
            payloadJson: craftJson(row.payload.value),
            createdAt: row.createdAt,
            readAt: row.readAt,
        });
        ctx.db.notification.id.delete(row.id);
    }
});

const FUNDING_KIND_SET: ReadonlySet<string> = new Set(FUNDING_NOTIFICATION_KINDS);
const FUNDING_ROLE_SET: ReadonlySet<string> = new Set(FUNDING_NOTIFICATION_ROLES);
const FUNDING_REASON_SET: ReadonlySet<string> = new Set(FUNDING_REASONS);

/**
 * Written by `brico-bot` for a funding alert (`stelo/notify.ts`). `kind`, `role`, `currency` and
 * `reason` are checked against their allow-lists, so a payload never carries display text.
 */
export const postFundingNotification = spacetimedb.reducer(
    {accountIdentity: t.identity(), payload: FundingNotificationPayload},
    (ctx, {accountIdentity, payload}) => {
        requireServicePrincipal(ctx);
        if (!FUNDING_KIND_SET.has(payload.kind)) throw new SenderError(`${CraftError.UNKNOWN_EVENT_KIND}:${payload.kind}`);
        if (!FUNDING_ROLE_SET.has(payload.role) || !isEscrowedCurrency(payload.currency)
            || (payload.reason !== undefined && !FUNDING_REASON_SET.has(payload.reason))) {
            throw new SenderError(`${CraftError.INVALID_FUNDING_STATUS}:payload`);
        }
        if (ctx.db.account.identity.find(accountIdentity) === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);

        ctx.db.notification_v2.insert({
            id: 0n,
            accountIdentity,
            payloadJson: fundingJson(payload),
            createdAt: ctx.timestamp,
            readAt: undefined,
        });
    }
);
