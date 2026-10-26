import {Identity, Timestamp} from 'spacetimedb';
import type {HandlerContext, InferSchema} from 'spacetimedb/server';
import {type Request, SyncResponse} from 'spacetimedb/server';
import {hashApiToken} from '../lib/apiKeys';
import type {ReadDb} from '../schema';
import {spacetimedb} from '../schema';

/*
 * Shared plumbing for the token-authenticated HTTP routes: bearer parsing, scope check, and JSON
 * encoding. Responses encode `u64`/`i64` as decimal strings, identities as hex strings and
 * timestamps as ISO-8601 strings.
 */

type Ctx = HandlerContext<InferSchema<typeof spacetimedb>>;

/** The boolean access flags on `api_key`. */
export type ApiKeyScope = 'readPayouts' | 'publicDashboard';

type Report = (db: ReadDb, accountIdentity: Identity) => unknown;

/** Converts a report to plain JSON: bigint → string, `Identity` → hex, `Timestamp` → ISO, `undefined` → null. */
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

/** Runs `report` for the account that owns the request's API key if the key carries `scope`, else answers 401/403. */
export function serve(ctx: Ctx, req: Request, scope: ApiKeyScope, report: Report): SyncResponse {
    const token = bearerToken(req);
    if (token === null) {
        return json({error: 'missing_token'}, 401, {'www-authenticate': 'Bearer'});
    }

    const result = ctx.withTx(tx => {
        const key = tx.db.api_key.tokenHash.find(hashApiToken(token));
        if (key === null) return {status: 401 as const};
        if (!key[scope]) return {status: 403 as const};
        return {status: 200 as const, body: report(tx.db, key.accountIdentity)};
    });

    switch (result.status) {
        case 401:
            return json({error: 'invalid_token'}, 401, {'www-authenticate': 'Bearer error="invalid_token"'});
        case 403:
            return json({error: 'insufficient_scope'}, 403);
        default:
            return json(result.body);
    }
}
