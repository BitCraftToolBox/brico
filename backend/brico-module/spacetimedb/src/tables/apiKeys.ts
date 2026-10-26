import {t, table} from 'spacetimedb/server';

/**
 * A bearer token that lets an account call the HTTP API (`http/`). Private: clients see only
 * `my_api_key`. One boolean per access flag; a new flag needs a `.default(...)`.
 */
export const api_key = table(
    {name: 'api_key'},
    {
        id: t.u64().primaryKey().autoInc(),
        accountIdentity: t.identity().index('btree'),
        name: t.string(),
        /** `hashApiToken` of the bearer token; the token itself is never stored. */
        tokenHash: t.string().unique(),
        createdAt: t.timestamp(),
        /** May call the read-only payout routes. */
        readPayouts: t.bool(),
        /** May call the public dashboard route; the key is meant to be shared with the dashboard's viewers. */
        publicDashboard: t.bool(),
    }
);

/**
 * Single-use random bytes, written by `brico-bot` (`seedApiKeyEntropy`) and consumed one per
 * `createApiKey`. The module has no secure randomness of its own: `ctx.random` is seeded from the
 * transaction timestamp alone.
 */
export const api_key_entropy = table(
    {name: 'api_key_entropy'},
    {
        id: t.u64().primaryKey().autoInc(),
        /** `API_KEY_ENTROPY_BYTES` bytes as lowercase hex. */
        bytes: t.string(),
    }
);
