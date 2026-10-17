// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {account} from '../tables/accounts';

/**
 * The caller's own account row. At most one row, but declared as an array because this is a *query* view.
 */
export const myAccount = spacetimedb.view(
    {name: 'my_account', public: true},
    t.array(account.rowType),
    ctx => ctx.from.account.where(a => a.identity.eq(ctx.sender))
);

/**
 * Unfiltered account feed for brico-bot. Same table, no identity predicate.
 */
export const allAccount = spacetimedb.view(
    {name: 'all_account', public: true},
    t.array(account.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.account.where(_ => isTrusted);
    }
);
