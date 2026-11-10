// noinspection JSUnusedGlobalSymbols

import {CommentStatus, isValidCommentPageKey, MAX_COMMENT_DEPTH, MAX_TOP_LEVEL_COMMENTS_PER_PAGE, normalizeCommentBody, ReportState} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount} from '../lib/auth';
import {recordCommentAction, resolveAuthorName} from '../lib/comments';
import {currentVersionStamp, refreshVersionIfStale} from '../lib/gameVersion';
import {fileUpdatedReport, resolveOpenReports} from '../lib/moderation';
import {notifyCommentReply} from '../lib/notify';
import {isRestricted} from '../lib/permissions';
import {spacetimedb} from '../schema';

/**
 * Posts a comment as the caller and returns its id. The author name and game version are resolved
 * server-side; the status is `pending` while a moderator requires review of the account's posts.
 * A visible reply notifies the parent's author.
 */
export const postComment = spacetimedb.procedure(
    {pageKey: t.string(), parentId: t.option(t.u64()), body: t.string()},
    t.u64(),
    (ctx, {pageKey, parentId, body}) => {
        if (!isValidCommentPageKey(pageKey)) throw new SenderError(CraftError.INVALID_COMMENT_PAGE_KEY);
        const normalized = normalizeCommentBody(body);
        if (normalized === null) throw new SenderError(CraftError.INVALID_COMMENT_BODY);

        ctx.withTx(tx => requireAccount(tx));
        refreshVersionIfStale(ctx);

        return ctx.withTx(tx => {
            const account = requireAccount(tx);
            if (isRestricted(tx.db, tx.sender, 'postBlockedUntil', tx.timestamp)) throw new SenderError(CraftError.POSTING_RESTRICTED);
            const authorName = resolveAuthorName(tx.db, account);
            if (authorName === undefined) throw new SenderError(CraftError.COMMENT_AUTHOR_NAME_REQUIRED);

            let depth = 0;
            if (parentId !== undefined) {
                const parent = tx.db.comment.id.find(parentId);
                if (parent === null || parent.pageKey !== pageKey || parent.status !== CommentStatus.Visible) {
                    throw new SenderError(CraftError.INVALID_COMMENT_PARENT);
                }
                depth = parent.depth + 1;
                if (depth > MAX_COMMENT_DEPTH) throw new SenderError(CraftError.COMMENT_TOO_DEEP);
            } else {
                let topLevel = 0;
                for (const row of tx.db.comment.pageKey.filter(pageKey)) {
                    if (row.depth === 0 && row.status === CommentStatus.Visible) topLevel++;
                }
                if (topLevel >= MAX_TOP_LEVEL_COMMENTS_PER_PAGE) throw new SenderError(CraftError.COMMENT_PAGE_FULL);
            }

            if (tx.db.moderator.identity.find(tx.sender) === null) {
                recordCommentAction(tx, true);
            }
            const versionTag = currentVersionStamp(tx);
            const needsReview = isRestricted(tx.db, tx.sender, 'reviewRequiredUntil', tx.timestamp);
            const inserted = tx.db.comment.insert({
                id: 0n,
                pageKey,
                parentId,
                depth,
                author: tx.sender,
                authorName,
                body: normalized,
                status: needsReview ? CommentStatus.Pending : CommentStatus.Visible,
                createdAt: tx.timestamp,
                versionTag,
                editedAt: undefined,
                editedVersionTag: undefined,
                outdatedAt: undefined,
                outdatedVersionTag: undefined,
                score: 0,
            });
            if (inserted.status === CommentStatus.Visible) notifyCommentReply(tx, inserted);
            return inserted.id;
        });
    }
);

/**
 * Replaces the body of the caller's own visible or pending comment, or of any comment when the
 * caller is a moderator, keeping the prior body as a revision. An author's edit of an
 * outdated-flagged comment clears the flag and files an `updated` report for review.
 */
export const editComment = spacetimedb.procedure(
    {id: t.u64(), body: t.string()},
    t.unit(),
    (ctx, {id, body}) => {
        const normalized = normalizeCommentBody(body);
        if (normalized === null) throw new SenderError(CraftError.INVALID_COMMENT_BODY);

        ctx.withTx(tx => requireAccount(tx));
        refreshVersionIfStale(ctx);

        ctx.withTx(tx => {
            requireAccount(tx);
            const row = tx.db.comment.id.find(id);
            if (row === null) throw new SenderError(CraftError.UNKNOWN_COMMENT);
            const asModerator = tx.db.moderator.identity.find(tx.sender) !== null;
            const isAuthor = row.author.isEqual(tx.sender);
            if (!isAuthor && !asModerator) throw new SenderError(CraftError.COMMENT_BELONGS_TO_ANOTHER_ACCOUNT);
            if (!asModerator) {
                if (row.status !== CommentStatus.Visible && row.status !== CommentStatus.Pending) {
                    throw new SenderError(CraftError.COMMENT_NOT_EDITABLE);
                }
                if (isRestricted(tx.db, tx.sender, 'postBlockedUntil', tx.timestamp)) throw new SenderError(CraftError.POSTING_RESTRICTED);
            }
            if (normalized === row.body) return;

            if (!asModerator) recordCommentAction(tx, false);
            const versionTag = currentVersionStamp(tx);
            tx.db.comment_revision.insert({
                id: 0n,
                commentId: id,
                body: row.body,
                editedAt: tx.timestamp,
                editor: tx.sender,
                versionTag: row.editedVersionTag ?? row.versionTag,
            });
            const clearsOutdated = isAuthor && !asModerator && row.outdatedAt !== undefined;
            tx.db.comment.id.update({
                ...row,
                body: normalized,
                editedAt: tx.timestamp,
                editedVersionTag: versionTag,
                ...(clearsOutdated ? {outdatedAt: undefined, outdatedVersionTag: undefined} : {}),
            });
            if (clearsOutdated) {
                resolveOpenReports(tx, id, ReportState.Dismissed, 'outdated');
                fileUpdatedReport(tx, id);
            }
        });
        return {};
    }
);

/**
 * Sets the caller's vote on another account's visible comment (`true` up, `false` down), or
 * removes it when `vote` is undefined, and adjusts the comment's score by the difference.
 */
export const voteComment = spacetimedb.reducer(
    {id: t.u64(), vote: t.option(t.bool())},
    (ctx, {id, vote}) => {
        requireAccount(ctx);
        const row = ctx.db.comment.id.find(id);
        if (row === null) throw new SenderError(CraftError.UNKNOWN_COMMENT);
        if (row.author.isEqual(ctx.sender)) throw new SenderError(CraftError.CANNOT_VOTE_OWN_COMMENT);

        const existing = [...ctx.db.comment_vote.by_voter_comment.filter([ctx.sender, id])][0];
        const previous = existing === undefined ? 0 : existing.up ? 1 : -1;
        const next = vote === undefined ? 0 : vote ? 1 : -1;
        if (previous === next) return;
        if (next !== 0 && row.status !== CommentStatus.Visible) throw new SenderError(CraftError.COMMENT_NOT_VOTABLE);

        if (vote === undefined) {
            ctx.db.comment_vote.id.delete(existing!.id);
        } else if (existing === undefined) {
            ctx.db.comment_vote.insert({id: 0n, commentId: id, pageKey: row.pageKey, voter: ctx.sender, up: vote});
        } else {
            ctx.db.comment_vote.id.update({...existing, up: vote});
        }
        ctx.db.comment.id.update({...row, score: row.score + next - previous});
    }
);

/** Marks the caller's own comment deleted. The body is kept for moderators. */
export const deleteOwnComment = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        requireAccount(ctx);
        const row = ctx.db.comment.id.find(id);
        if (row === null) throw new SenderError(CraftError.UNKNOWN_COMMENT);
        if (!row.author.isEqual(ctx.sender)) throw new SenderError(CraftError.COMMENT_BELONGS_TO_ANOTHER_ACCOUNT);
        if (row.status === CommentStatus.Deleted) return;
        if (row.status === CommentStatus.Hidden) throw new SenderError(CraftError.COMMENT_NOT_EDITABLE);
        ctx.db.comment.id.update({...row, status: CommentStatus.Deleted});
    }
);
