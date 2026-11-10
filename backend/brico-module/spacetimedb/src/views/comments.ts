// noinspection JSUnusedGlobalSymbols

import {CommentStatus, ReportState} from '@brico/crafts/comments';
import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {comment, comment_report, comment_revision, comment_vote, moderator} from '../tables/comments';

/**
 * The visible comments of one page. Hidden, pending and deleted rows are never returned, so a
 * reply whose parent is missing from the result is an orphan of a removed comment.
 */
export const userComments = spacetimedb.anonymousView(
    {name: 'user_comments', public: true},
    {pageKey: t.string()},
    t.array(comment.rowType),
    (ctx, {pageKey}) => ctx.from.comment.where(c => c.pageKey.eq(pageKey).and(c.status.eq(CommentStatus.Visible)))
);

/**
 * Every comment of one page, hidden and pending included, for moderators; nobody else gets rows.
 * Subscribe to this instead of `user_comments` when `my_moderator` is non-empty.
 */
export const adminComments = spacetimedb.view(
    {name: 'admin_comments', public: true},
    {pageKey: t.string()},
    t.array(comment.rowType),
    (ctx, {pageKey}) => {
        const isModerator = ctx.db.moderator.identity.find(ctx.sender) !== null;
        return ctx.from.comment.where(c => c.pageKey.eq(pageKey)).where(_ => isModerator);
    }
);

/** The caller's own votes on one page's comments. */
export const myCommentVotes = spacetimedb.view(
    {name: 'my_comment_votes', public: true},
    {pageKey: t.string()},
    t.array(comment_vote.rowType),
    (ctx, {pageKey}) => ctx.from.comment_vote.where(v => v.pageKey.eq(pageKey).and(v.voter.eq(ctx.sender)))
);

/** The prior bodies of one comment, for moderators. */
export const adminCommentRevisions = spacetimedb.view(
    {name: 'admin_comment_revisions', public: true},
    {commentId: t.u64()},
    t.array(comment_revision.rowType),
    (ctx, {commentId}) => {
        const isModerator = ctx.db.moderator.identity.find(ctx.sender) !== null;
        return ctx.from.comment_revision.where(r => r.commentId.eq(commentId)).where(_ => isModerator);
    }
);

/** The caller's own `moderator` row; non-empty tells the client to use the `admin_*` views. */
export const myModerator = spacetimedb.view(
    {name: 'my_moderator', public: true},
    t.array(moderator.rowType),
    ctx => ctx.from.moderator.where(m => m.identity.eq(ctx.sender))
);

/** Reports still awaiting a moderator, for moderators. */
export const adminOpenReports = spacetimedb.view(
    {name: 'admin_open_reports', public: true},
    t.array(comment_report.rowType),
    ctx => {
        const isModerator = ctx.db.moderator.identity.find(ctx.sender) !== null;
        return ctx.from.comment_report.where(r => r.state.eq(ReportState.Open)).where(_ => isModerator);
    }
);
