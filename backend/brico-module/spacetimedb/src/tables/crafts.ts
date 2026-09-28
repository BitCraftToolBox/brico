import {t, table} from 'spacetimedb/server';

/**
 * A craft-browser filter saved by an account, synced across devices. `id` is client-generated
 * (`crypto.randomUUID()`) so a device can create one offline and reconcile it later without a
 * server round trip first.
 *
 * `updatedAt` is CLIENT-supplied, not server-stamped: the whole point of this table is reconciling
 * a backlog of edits made while offline, and `ctx.timestamp` would make whichever device's backlog
 * arrives *last* always win, regardless of which edit is actually newer.
 */
export const saved_craft_filter = table(
    {name: 'saved_craft_filter'},
    {
        id: t.string().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        name: t.string(),
        filterJson: t.string(),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * DEPRECATED: do not use.
 */
export const craft_filter_watch = table(
    {name: 'craft_filter_watch'},
    {
        filterId: t.string().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        added: t.bool(),
        finished: t.bool(),
        removed: t.bool(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * A share code minted by `createSharedFilters` for one or more of the caller's own
 * `saved_craft_filter` rows, redeemed by `readSharedFilters`. Private — no client ever subscribes
 * to it directly, only ever reached through those two procedures.
 */
export const shared_filter = table(
    {name: 'shared_filter'},
    {
        code: t.string().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        filterIds: t.array(t.string()),
        createdAt: t.timestamp(),
    }
);
