// noinspection JSUnusedGlobalSymbols

import {CommentStatus, isValidCommentPageKey} from '@brico/crafts/comments';
import {SyncResponse} from 'spacetimedb/server';
import {spacetimedb} from '../schema';

const COUNT_CACHE_SECONDS = 60;

function reply(body: object, status: number, cacheControl: string): SyncResponse {
    return new SyncResponse(JSON.stringify(body), {
        status,
        headers: {'content-type': 'application/json', 'cache-control': cacheControl},
    });
}

/** A query-string value; the module runtime has no `URL`. */
function queryParam(url: string, name: string): string | undefined {
    const query = url.split('?')[1] ?? '';
    for (const pair of query.split('&')) {
        const [key, value = ''] = pair.split('=');
        if (key !== name) continue;
        try {
            return decodeURIComponent(value);
        } catch {
            return undefined;
        }
    }
    return undefined;
}

/**
 * `GET /comments/count?pageKey=item:1234` (routed in `router.ts`) — `{count}` of the page's
 * visible comments. Public and unauthenticated, so it answers with the number only.
 */
export const commentCount = spacetimedb.httpHandler((ctx, req) => {
    const pageKey = queryParam(req.url, 'pageKey') ?? '';
    if (!isValidCommentPageKey(pageKey)) return reply({error: 'invalid_page_key'}, 400, 'no-store');

    const count = ctx.withTx(tx => {
        let visible = 0;
        for (const row of tx.db.comment.pageKey.filter(pageKey)) {
            if (row.status === CommentStatus.Visible) visible++;
        }
        return visible;
    });
    return reply({count}, 200, `public, max-age=${COUNT_CACHE_SECONDS}`);
});
