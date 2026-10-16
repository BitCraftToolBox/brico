import {t, table} from 'spacetimedb/server';

/**
 * A craft-sourced notification's payload.
 */
export const CraftNotificationPayload = t.object('CraftNotificationPayload', {
    /** `craft_filter_watch.filterId` at fire time — a loose join key, not an FK (the filter/watch
     * may since have been renamed or deleted; this payload is a snapshot). */
    watchId: t.string(),
    filterName: t.string(),
    /** 'added' | 'finished' | 'removed', validated in `postCraftNotification`. */
    eventKind: t.string(),
    craftId: t.string(),
    recipeId: t.i32(),
    regionName: t.string(),
    claimName: t.option(t.string()),
    ownerName: t.option(t.string()),
});

/** A funding alert's payload: ids and machine codes only, never display text. */
export const FundingNotificationPayload = t.object('FundingNotificationPayload', {
    /** One of `FUNDING_NOTIFICATION_KINDS` in `@brico/crafts/stelo`. */
    kind: t.string(),
    /** 'payer' | 'payee'. */
    role: t.string(),
    currency: t.string(),
    craftId: t.option(t.u64()),
    amount: t.option(t.i64()),
    reason: t.option(t.string()),
    /** Unclaimed-money events: who the money was owed by and to. */
    payerName: t.option(t.string()),
    payeeName: t.option(t.string()),
});

/**
 * Payload sum type of the legacy `notification` table. Adding a variant is a breaking schema
 * change, so it stays frozen; new sources only extend `notification_v2`'s JSON payload.
 */
export const NotificationPayload = t.enum('NotificationPayload', {
    craft: CraftNotificationPayload,
});

/** Legacy notification rows; `migrateNotificationsToV2` drains it into `notification_v2`. Nothing writes to it. */
export const notification = table(
    {
        name: 'notification',
    },
    {
        id: t.u64().primaryKey().autoInc(),
        accountIdentity: t.identity().index('btree'),
        payload: NotificationPayload,
        createdAt: t.timestamp(),
        readAt: t.option(t.timestamp()),
    }
);

/**
 * One notification for one account. Hard-deleted on removal. `payloadJson` is a
 * `NotificationPayload` from `@brico/crafts/notification`; readers skip tags they don't know, so a
 * new source needs no schema change.
 *
 * No dedup/idempotency index: `createWatchMatcher` only emits events after its first (silent,
 * priming) `update()` call, and a `brico-bot` restart always rebuilds matchers unprimed, so a
 * restart cannot regenerate `added` events for already-matching crafts. A unique index would guard
 * a failure mode the code cannot currently produce, and would fight a legitimate case (the same
 * filter/craft/event triple recurring later, e.g. added -> removed -> added again).
 */
export const notification_v2 = table(
    {
        name: 'notification_v2',
    },
    {
        id: t.u64().primaryKey().autoInc(),
        accountIdentity: t.identity().index('btree'),
        payloadJson: t.string(),
        createdAt: t.timestamp(),
        readAt: t.option(t.timestamp()),
    }
);
