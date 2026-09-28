// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {saved_craft_filter} from '../tables/crafts';

/** The caller's own saved filters, tombstoned ones included so the sync layer can see deletions. */
export const mySavedCraftFilter = spacetimedb.view(
    {name: 'my_saved_craft_filter', public: true},
    t.array(saved_craft_filter.rowType),
    ctx => ctx.from.saved_craft_filter.where(f => f.accountIdentity.eq(ctx.sender))
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
