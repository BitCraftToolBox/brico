// noinspection JSUnusedGlobalSymbols

import {isValidCommentPageKey} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import {type Infer, SenderError, t} from 'spacetimedb/server';
import {requireModerator} from '../lib/auth';
import {spacetimedb} from '../schema';
import {account_permission, comment, comment_report} from '../tables/comments';

const ADMIN_PAGE_SIZE = 50;
const MAX_COMMENTS_BY_ID = 200;
const MAX_COMMENTER_ROWS = 100;

type CommentRow = Infer<typeof comment.rowType>;

const AdminCommentFilters = t.object('AdminCommentFilters', {
    status: t.option(t.u8()),
    author: t.option(t.identity()),
    pageKey: t.option(t.string()),
});

const AdminCommentPage = t.object('AdminCommentPage', {
    comments: t.array(comment.rowType),
    /** Pass as `cursor` for the next page; absent on the last page. */
    nextCursor: t.option(t.u64()),
});

/**
 * One newest-first page of comments, optionally filtered, starting below `cursor`. A filter by
 * author or page reads that index; otherwise it scans the whole comment table.
 */
export const adminListComments = spacetimedb.procedure(
    {cursor: t.option(t.u64()), filters: AdminCommentFilters},
    AdminCommentPage,
    (ctx, {cursor, filters}) => {
        if (filters.pageKey !== undefined && !isValidCommentPageKey(filters.pageKey)) throw new SenderError(CraftError.INVALID_COMMENT_PAGE_KEY);
        return ctx.withTx(tx => {
            requireModerator(tx);
            const source: Iterable<CommentRow> = filters.author !== undefined
                ? tx.db.comment.author.filter(filters.author)
                : filters.pageKey !== undefined
                    ? tx.db.comment.pageKey.filter(filters.pageKey)
                    : tx.db.comment.iter();
            const ids: bigint[] = [];
            for (const row of source) {
                if (cursor !== undefined && row.id >= cursor) continue;
                if (filters.status !== undefined && row.status !== filters.status) continue;
                if (filters.author !== undefined && !row.author.isEqual(filters.author)) continue;
                if (filters.pageKey !== undefined && row.pageKey !== filters.pageKey) continue;
                ids.push(row.id);
            }
            ids.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
            const pageIds = ids.slice(0, ADMIN_PAGE_SIZE);
            const comments = pageIds.map(id => tx.db.comment.id.find(id)!);
            return {comments, nextCursor: ids.length > pageIds.length ? pageIds[pageIds.length - 1] : undefined};
        });
    }
);

/** The comments with the given ids, for showing the text of reported comments. Unknown ids are skipped. */
export const adminGetComments = spacetimedb.procedure(
    {ids: t.array(t.u64())},
    t.array(comment.rowType),
    (ctx, {ids}) => ctx.withTx(tx => {
        requireModerator(tx);
        const comments: CommentRow[] = [];
        for (const id of ids.slice(0, MAX_COMMENTS_BY_ID)) {
            const row = tx.db.comment.id.find(id);
            if (row !== null) comments.push(row);
        }
        return comments;
    })
);

const AdminCommenter = t.object('AdminCommenter', {
    identity: t.identity(),
    displayName: t.option(t.string()),
    createdAt: t.timestamp(),
    isModerator: t.bool(),
    permission: t.option(account_permission.rowType),
    /** Newest first, at most `MAX_COMMENTER_ROWS` of each list below. */
    comments: t.array(comment.rowType),
    reportsBy: t.array(comment_report.rowType),
    reportsAgainst: t.array(comment_report.rowType),
});

/** An account's moderation profile. Exposes the identity, display name and creation time only, never `issuer` or `subject`. */
export const adminGetCommenter = spacetimedb.procedure(
    {identity: t.identity()},
    AdminCommenter,
    (ctx, {identity}) => ctx.withTx(tx => {
        requireModerator(tx);
        const account = tx.db.account.identity.find(identity);
        if (account === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);

        const filterReports = function*(rows: Iterable<Infer<typeof comment_report.rowType>>) {
            for (const row of rows)
                if (row.reason.tag !== 'outdated' && row.reason.tag !== 'updated')
                    yield row;
        };
        const newestFirst = <T extends { id: bigint }>(rows: Iterable<T>) =>
            [...rows].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, MAX_COMMENTER_ROWS);

        return {
            identity,
            displayName: account.displayName,
            createdAt: account.createdAt,
            isModerator: tx.db.moderator.identity.find(identity) !== null,
            permission: tx.db.account_permission.identity.find(identity) ?? undefined,
            comments: newestFirst(tx.db.comment.author.filter(identity)),
            reportsBy: newestFirst(filterReports(tx.db.comment_report.reporter.filter(identity))),
            reportsAgainst: newestFirst(filterReports(tx.db.comment_report.author.filter(identity))),
        };
    })
);
