// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {craft_filter_watch, saved_craft_filter} from '../tables/crafts';

/** The caller's own saved filters, tombstoned ones included so the sync layer can see deletions. */
export const mySavedCraftFilter = spacetimedb.view(
    {name: 'my_saved_craft_filter', public: true},
    t.array(saved_craft_filter.rowType),
    ctx => ctx.from.saved_craft_filter.where(f => f.accountIdentity.eq(ctx.sender))
);

/** The caller's own watch rows, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myCraftFilterWatch = spacetimedb.view(
    {name: 'my_craft_filter_watch', public: true},
    t.array(craft_filter_watch.rowType),
    ctx => ctx.from.craft_filter_watch.where(w => w.accountIdentity.eq(ctx.sender))
);

/** Unfiltered saved-filter feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allSavedCraftFilter = spacetimedb.view(
    {name: 'all_saved_craft_filter', public: true},
    t.array(saved_craft_filter.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.saved_craft_filter.where(_ => isTrusted);
    }
);

/** Unfiltered watch feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allCraftFilterWatch = spacetimedb.view(
    {name: 'all_craft_filter_watch', public: true},
    t.array(craft_filter_watch.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_filter_watch.where(_ => isTrusted);
    }
);
