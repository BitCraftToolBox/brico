// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {craft_filter_notify_trigger} from '../tables/notify';

/** The caller's own notification trigger rows, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myCraftFilterNotifyTrigger = spacetimedb.view(
    {name: 'my_craft_filter_notify_trigger', public: true},
    t.array(craft_filter_notify_trigger.rowType),
    ctx => ctx.from.craft_filter_notify_trigger.where(t => t.accountIdentity.eq(ctx.sender))
);

/** Unfiltered notification-trigger feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allCraftFilterNotifyTrigger = spacetimedb.view(
    {name: 'all_craft_filter_notify_trigger', public: true},
    t.array(craft_filter_notify_trigger.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_filter_notify_trigger.where(_ => isTrusted);
    }
);
