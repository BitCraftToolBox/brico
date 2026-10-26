// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';

const ApiKeyRow = t.row('ApiKeyRow', {
    id: t.u64().primaryKey(),
    name: t.string(),
    createdAt: t.timestamp(),
    readPayouts: t.bool(),
    publicDashboard: t.bool(),
});

/** The caller's own API keys, without their tokens. Procedural, not a query, to drop the token hash. */
export const myApiKey = spacetimedb.view(
    {name: 'my_api_key', public: true},
    t.array(ApiKeyRow),
    ctx => Array.from(ctx.db.api_key.accountIdentity.filter(ctx.sender), key => ({
        id: key.id,
        name: key.name,
        createdAt: key.createdAt,
        readPayouts: key.readPayouts,
        publicDashboard: key.publicDashboard,
    }))
);
