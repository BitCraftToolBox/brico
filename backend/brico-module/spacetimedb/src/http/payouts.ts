// noinspection JSUnusedGlobalSymbols

import {Identity, Timestamp} from 'spacetimedb';
import type {HandlerContext, InferSchema} from 'spacetimedb/server';
import {type Request, Router, SyncResponse} from 'spacetimedb/server';
import {hashApiToken} from '../lib/apiKeys';
import {entitlementsAsContributor, entitlementsAsPayer, payoutLogAsContributor, payoutLogAsPayer} from '../lib/payouts';
import type {ReadDb} from '../schema';
import {spacetimedb} from '../schema';

/*
 * Read-only payout reports over HTTP, one route per `my_*` payout view, authenticated by an API
 * key (`Authorization: Bearer <token>`, see `createApiKey`) instead of a connection identity.
 * Responses are JSON arrays shaped like the view rows, with `u64`/`i64` as decimal strings,
 * identities as hex strings and timestamps as ISO-8601 strings.
 */

type Ctx = HandlerContext<InferSchema<typeof spacetimedb>>;
type Report = (db: ReadDb, accountIdentity: Identity) => unknown[];

/** Converts a view row to plain JSON: bigint → string, `Identity` → hex, `Timestamp` → ISO, `undefined` → null. */
function toJson(value: unknown): unknown {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Identity) return value.toHexString();
    if (value instanceof Timestamp) return value.toISOString();
    if (Array.isArray(value)) return value.map(toJson);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, toJson(v)]));
    }
    return value;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): SyncResponse {
    return new SyncResponse(JSON.stringify(toJson(body)), {
        status,
        headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...headers},
    });
}

function bearerToken(req: Request): string | null {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('authorization') ?? '');
    return match ? match[1] : null;
}

/** Runs `report` for the account that owns the request's API key, or answers 401/403. */
function serve(ctx: Ctx, req: Request, report: Report): SyncResponse {
    const token = bearerToken(req);
    if (token === null) {
        return json({error: 'missing_token'}, 401, {'www-authenticate': 'Bearer'});
    }

    const result = ctx.withTx(tx => {
        const key = tx.db.api_key.tokenHash.find(hashApiToken(token));
        if (key === null) return {status: 401 as const};
        if (!key.readPayouts) return {status: 403 as const};
        return {status: 200 as const, rows: report(tx.db, key.accountIdentity)};
    });

    switch (result.status) {
        case 401:
            return json({error: 'invalid_token'}, 401, {'www-authenticate': 'Bearer error="invalid_token"'});
        case 403:
            return json({error: 'insufficient_scope'}, 403);
        default:
            return json(result.rows);
    }
}

/** Same rows as `my_entitlements_as_payer`. */
export const payerEntitlements = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, entitlementsAsPayer));

/** Same rows as `my_bounty_payout_record_log_as_payer`. */
export const payerLog = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, payoutLogAsPayer));

/** Same rows as `my_entitlements_as_contributor`. */
export const payeeEntitlements = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, entitlementsAsContributor));

/** Same rows as `my_bounty_payout_record_log_as_contributor`. */
export const payeeLog = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, payoutLogAsContributor));

// if/when other routes are added, this can be switched to a sub-router on /payouts
export const payoutsRouter = spacetimedb.httpRouter(
    new Router()
        .get('/payouts/payer/entitlements', payerEntitlements)
        .get('/payouts/payer/log', payerLog)
        .get('/payouts/payee/entitlements', payeeEntitlements)
        .get('/payouts/payee/log', payeeLog)
);
