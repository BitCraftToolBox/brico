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

/**
 * Generic from the start: one row shape, a sum-typed payload column that varies per source
 * (`craft` today, others later) — a future watchable type adds a variant here, not a second table.
 */
export const NotificationPayload = t.enum('NotificationPayload', {
    craft: CraftNotificationPayload,
});

/**
 * One notification for one account. Hard-deleted on removal.
 *
 * No dedup/idempotency index: `createWatchMatcher` only emits events after its first (silent,
 * priming) `update()` call, and a `brico-bot` restart always rebuilds matchers unprimed, so a
 * restart cannot regenerate `added` events for already-matching crafts. A unique index would guard
 * a failure mode the code cannot currently produce, and would fight a legitimate case (the same
 * filter/craft/event triple recurring later, e.g. added -> removed -> added again).
 */
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
