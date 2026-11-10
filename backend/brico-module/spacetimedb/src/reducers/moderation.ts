// noinspection JSUnusedGlobalSymbols

import {
    CommentStatus,
    MAX_MODERATION_REASON_LENGTH,
    MAX_REPORT_NOTE_LENGTH,
    MAX_REPORTS_PER_HOUR,
    normalizeNote,
    PERMANENT_UNTIL_MICROS,
    ReportState
} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import {Timestamp} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireModerator, requireServicePrincipal} from '../lib/auth';
import {requireValidDisplayName, syncAuthorName} from '../lib/comments';
import {currentVersionStamp} from '../lib/gameVersion';
import {applyReportThresholds, requireModerationTarget, resolveOpenReports} from '../lib/moderation';
import {notifyCommentReply} from '../lib/notify';
import {isRestricted} from '../lib/permissions';
import {spacetimedb} from '../schema';
import {CommentReportReason} from '../tables/comments';

const HOUR_MICROS = 3_600n * 1_000_000n;

/**
 * Reports `id` on behalf of the caller. A repeat of an open report by the same account is ignored.
 * Enough distinct reporters can hide the comment or flag it outdated (`applyReportThresholds`).
 */
export const reportComment = spacetimedb.reducer(
    {id: t.u64(), reason: CommentReportReason, note: t.option(t.string())},
    (ctx, {id, reason, note}) => {
        requireAccount(ctx);
        if (reason.tag === 'updated') throw new SenderError(CraftError.INVALID_REPORT_REASON);
        let normalizedNote: string | undefined;
        if (note !== undefined) {
            const checked = normalizeNote(note, MAX_REPORT_NOTE_LENGTH);
            if (checked === null) throw new SenderError(CraftError.INVALID_REPORT_NOTE);
            normalizedNote = checked === '' ? undefined : checked;
        }
        if (isRestricted(ctx.db, ctx.sender, 'reportBlockedUntil', ctx.timestamp)) throw new SenderError(CraftError.REPORTING_RESTRICTED);

        // Only visible comments are reachable by non-moderators, so anything else reads as missing.
        const comment = ctx.db.comment.id.find(id);
        if (comment === null || comment.status !== CommentStatus.Visible) throw new SenderError(CraftError.UNKNOWN_COMMENT);

        for (const report of ctx.db.comment_report.commentId.filter(id)) {
            if (report.state === ReportState.Open && report.reporter.isEqual(ctx.sender) && report.reason.tag === reason.tag) return;
        }

        const windowStart = ctx.timestamp.microsSinceUnixEpoch - HOUR_MICROS;
        let recent = 0;
        for (const report of ctx.db.comment_report.reporter.filter(ctx.sender)) {
            if (report.reason.tag !== 'updated' && report.createdAt.microsSinceUnixEpoch > windowStart) recent++;
        }
        if (recent >= MAX_REPORTS_PER_HOUR) throw new SenderError(CraftError.REPORT_RATE_LIMITED);

        ctx.db.comment_report.insert({
            id: 0n,
            commentId: id,
            reporter: ctx.sender,
            author: comment.author,
            reason,
            note: normalizedNote,
            createdAt: ctx.timestamp,
            state: ReportState.Open,
            resolvedBy: undefined,
            resolvedAt: undefined,
        });
        applyReportThresholds(ctx, comment);
    }
);

/**
 * Hides a comment, or makes a hidden or pending one visible again. Author-deleted comments stay
 * deleted. Approving a pending reply notifies the parent's author.
 */
export const setCommentStatus = spacetimedb.reducer(
    {id: t.u64(), status: t.u8()},
    (ctx, {id, status}) => {
        requireModerator(ctx);
        if (status !== CommentStatus.Visible && status !== CommentStatus.Hidden) throw new SenderError(CraftError.INVALID_COMMENT_STATUS);
        const row = ctx.db.comment.id.find(id);
        if (row === null) throw new SenderError(CraftError.UNKNOWN_COMMENT);
        if (row.status === CommentStatus.Deleted) throw new SenderError(CraftError.COMMENT_NOT_EDITABLE);
        if (row.status === status) return;
        const updated = {...row, status};
        ctx.db.comment.id.update(updated);
        if (row.status === CommentStatus.Pending && status === CommentStatus.Visible) notifyCommentReply(ctx, updated);
    }
);

/**
 * Sets or clears the outdated flag on a comment. Moderators do either; the author may only set
 * it (while the comment is visible or pending), since an edit is what clears it for them.
 * Clearing dismisses the comment's open `outdated` reports.
 */
export const setCommentOutdated = spacetimedb.reducer(
    {id: t.u64(), outdated: t.bool()},
    (ctx, {id, outdated}) => {
        const row = ctx.db.comment.id.find(id);
        if (row === null) throw new SenderError(CraftError.UNKNOWN_COMMENT);
        if (ctx.db.moderator.identity.find(ctx.sender) === null) {
            requireAccount(ctx);
            if (!row.author.isEqual(ctx.sender)) throw new SenderError(CraftError.COMMENT_BELONGS_TO_ANOTHER_ACCOUNT);
            if (row.status !== CommentStatus.Visible && row.status !== CommentStatus.Pending) throw new SenderError(CraftError.COMMENT_NOT_EDITABLE);
            if (!outdated) throw new SenderError(CraftError.NOT_MODERATOR);
        }

        if (outdated) {
            if (row.outdatedAt !== undefined) return;
            ctx.db.comment.id.update({...row, outdatedAt: ctx.timestamp, outdatedVersionTag: currentVersionStamp(ctx)});
            return;
        }
        if (row.outdatedAt !== undefined) {
            ctx.db.comment.id.update({...row, outdatedAt: undefined, outdatedVersionTag: undefined});
        }
        resolveOpenReports(ctx, id, ReportState.Dismissed, 'outdated');
    }
);

/** Closes an open report as dismissed or actioned. Hiding the comment is a separate `setCommentStatus`. */
export const resolveReport = spacetimedb.reducer(
    {id: t.u64(), state: t.u8()},
    (ctx, {id, state}) => {
        requireModerator(ctx);
        if (state !== ReportState.Dismissed && state !== ReportState.Actioned) throw new SenderError(CraftError.INVALID_COMMENT_STATUS);
        const report = ctx.db.comment_report.id.find(id);
        if (report === null) throw new SenderError(CraftError.UNKNOWN_COMMENT_REPORT);
        if (report.state !== ReportState.Open) return;
        ctx.db.comment_report.id.update({...report, state, resolvedBy: ctx.sender, resolvedAt: ctx.timestamp});
    }
);

/** A restriction end that is still in the future, or `undefined` when unset or already past. */
function activeUntil(value: Timestamp | undefined, now: Timestamp): Timestamp | undefined {
    if (value === undefined) return undefined;
    if (value.microsSinceUnixEpoch > PERMANENT_UNTIL_MICROS) throw new SenderError(CraftError.INVALID_RESTRICTION_END);
    return value.microsSinceUnixEpoch > now.microsSinceUnixEpoch ? value : undefined;
}

/**
 * Replaces all of an account's restrictions. Each argument is an end time, `PERMANENT_UNTIL_MICROS`,
 * or null for none. A row left with nothing set is deleted.
 */
export const setAccountPermissions = spacetimedb.reducer(
    {
        identity: t.identity(),
        postBlockedUntil: t.option(t.timestamp()),
        reviewRequiredUntil: t.option(t.timestamp()),
        nameLockedUntil: t.option(t.timestamp()),
        reportBlockedUntil: t.option(t.timestamp()),
        reason: t.option(t.string()),
    },
    (ctx, {identity, postBlockedUntil, reviewRequiredUntil, nameLockedUntil, reportBlockedUntil, reason}) => {
        requireModerator(ctx);
        requireModerationTarget(ctx, identity);
        let normalizedReason: string | undefined;
        if (reason !== undefined) {
            const checked = normalizeNote(reason, MAX_MODERATION_REASON_LENGTH);
            if (checked === null) throw new SenderError(CraftError.INVALID_MODERATION_REASON);
            normalizedReason = checked === '' ? undefined : checked;
        }

        const restrictions = {
            postBlockedUntil: activeUntil(postBlockedUntil, ctx.timestamp),
            reviewRequiredUntil: activeUntil(reviewRequiredUntil, ctx.timestamp),
            nameLockedUntil: activeUntil(nameLockedUntil, ctx.timestamp),
            reportBlockedUntil: activeUntil(reportBlockedUntil, ctx.timestamp),
        };
        if (Object.values(restrictions).every(value => value === undefined)) {
            ctx.db.account_permission.identity.delete(identity);
            return;
        }
        const row = {identity, reason: normalizedReason, updatedBy: ctx.sender, updatedAt: ctx.timestamp, ...restrictions};
        if (ctx.db.account_permission.identity.find(identity) === null) ctx.db.account_permission.insert(row);
        else ctx.db.account_permission.identity.update(row);
    }
);

/** Replaces an account's display name, bypassing `nameLockedUntil`, and re-syncs its comments. */
export const moderatorSetDisplayName = spacetimedb.reducer(
    {identity: t.identity(), displayName: t.string()},
    (ctx, {identity, displayName}) => {
        requireModerator(ctx);
        const account = requireModerationTarget(ctx, identity);
        const name = requireValidDisplayName(displayName);
        if (name === account.displayName) return;
        ctx.db.account.identity.update({...account, displayName: name});
        syncAuthorName(ctx, identity, name);
    }
);

/** Hides every visible or pending comment by an account. */
export const hideAllByCommenter = spacetimedb.reducer(
    {identity: t.identity()},
    (ctx, {identity}) => {
        requireModerator(ctx);
        requireModerationTarget(ctx, identity);
        for (const row of ctx.db.comment.author.filter(identity)) {
            if (row.status === CommentStatus.Visible || row.status === CommentStatus.Pending) {
                ctx.db.comment.id.update({...row, status: CommentStatus.Hidden});
            }
        }
    }
);

/** Makes an account a moderator. */
export const grantModerator = spacetimedb.reducer(
    {identity: t.identity()},
    (ctx, {identity}) => {
        requireServicePrincipal(ctx);
        if (ctx.db.account.identity.find(identity) === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);
        if (ctx.db.moderator.identity.find(identity) !== null) return;
        ctx.db.moderator.insert({identity, grantedBy: ctx.sender, grantedAt: ctx.timestamp});
    }
);

export const revokeModerator = spacetimedb.reducer(
    {identity: t.identity()},
    (ctx, {identity}) => {
        requireServicePrincipal(ctx);
        ctx.db.moderator.identity.delete(identity);
    }
);
