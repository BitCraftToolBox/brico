import {formatVersionStamp, parseReleaseVersion} from '@brico/crafts/comments';
import {TimeDuration} from 'spacetimedb';
import type {InferSchema, ProcedureCtx} from 'spacetimedb/server';
import type {Ctx, spacetimedb} from '../schema';

/*
 * The game data version that comments are stamped with, as `<release version> (<latest data tag>)`.
 * It comes from cereal's `latest.json` (the same file `version-checker.tsx` polls), never from the
 * client. The cache keeps `tag` and the release label so the stamp can be rebuilt without a fetch.
 */

/** The host is a constant, never an argument. */
const LATEST_VERSION_URL = 'https://cereal-data.brico.app/latest.json';
const CACHE_TTL_MICROS = 15n * 60n * 1_000_000n;
const FETCH_TIMEOUT_MS = 3000;
const MAX_TAG_LENGTH = 64;
const MAX_LABEL_LENGTH = 200;

type ProcCtx = ProcedureCtx<InferSchema<typeof spacetimedb>>;

/**
 * Fetches `latest.json` when the cached copy is older than 15 minutes and commits the result in its
 * own transaction, so it persists even if the caller's later transaction fails. A failed fetch
 * leaves the cache untouched. Call it before the caller's main `withTx`, since `ctx.http.fetch`
 * can't run inside one.
 */
export function refreshVersionIfStale(ctx: ProcCtx): void {
    const fresh = ctx.withTx(tx => {
        const cached = tx.db.game_version_cache.id.find(0);
        return cached !== null && tx.timestamp.microsSinceUnixEpoch - cached.fetchedAt.microsSinceUnixEpoch < CACHE_TTL_MICROS;
    });
    if (fresh) return;

    let tag: string;
    let label: string | undefined;
    try {
        const response = ctx.http.fetch(LATEST_VERSION_URL, {timeout: TimeDuration.fromMillis(FETCH_TIMEOUT_MS)});
        if (response.status !== 200) return;
        const body = response.json();
        if (typeof body?.tag !== 'string' || body.tag === '' || body.tag.length > MAX_TAG_LENGTH) return;
        tag = body.tag;
        label = typeof body.releaseLabel === 'string' && body.releaseLabel !== '' ? body.releaseLabel.slice(0, MAX_LABEL_LENGTH) : undefined;
    } catch {
        return;
    }

    ctx.withTx(tx => {
        const row = {id: 0, tag, label, fetchedAt: tx.timestamp};
        if (tx.db.game_version_cache.id.find(0) === null) tx.db.game_version_cache.insert(row);
        else tx.db.game_version_cache.id.update(row);
    });
}

/** The stamp for the cached version, or `undefined` when nothing has been fetched yet. */
export function currentVersionStamp(ctx: Ctx): string | undefined {
    const cached = ctx.db.game_version_cache.id.find(0);
    return cached ? formatVersionStamp(parseReleaseVersion(cached.label), cached.tag) : undefined;
}
