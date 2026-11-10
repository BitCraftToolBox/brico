import {CommentStatus, HIDE_REPORT_THRESHOLD, OUTDATED_REPORT_THRESHOLD, ReportState} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import type {Identity} from 'spacetimedb';
import {type Infer, SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';
import type {comment, CommentReportReason} from '../tables/comments';
import {currentVersionStamp} from './gameVersion';

type ReportReason = Infer<typeof CommentReportReason>['tag'];

/** Marks the comment's open reports (of `reason`, or of any reason) as resolved by the caller. */
export function resolveOpenReports(ctx: Ctx, commentId: bigint, state: number, reason?: ReportReason): void {
    for (const report of ctx.db.comment_report.commentId.filter(commentId)) {
        if (report.state !== ReportState.Open || (reason !== undefined && report.reason.tag !== reason)) continue;
        ctx.db.comment_report.id.update({...report, state, resolvedBy: ctx.sender, resolvedAt: ctx.timestamp});
    }
}

type CommentRow = Infer<typeof comment.rowType>;

/** Reasons whose open reports count toward hiding a comment; `outdated`, `updated` and `bad_name` don't. */
const HIDE_REASONS: ReadonlySet<ReportReason> = new Set(['spam', 'abuse', 'offTopic', 'other']);

/**
 * Run after a report is filed. `HIDE_REPORT_THRESHOLD` distinct accounts with an open hide-reason
 * report hide a visible comment, exactly as a moderator's hide does; `OUTDATED_REPORT_THRESHOLD`
 * with an open `outdated` report flag it outdated and close those reports as actioned. A moderator
 * can still restore or unflag it afterwards.
 */
export function applyReportThresholds(ctx: Ctx, comment: CommentRow): void {
    const hideReporters = new Set<string>();
    const outdatedReports: {id: bigint; reporter: string}[] = [];
    for (const report of ctx.db.comment_report.commentId.filter(comment.id)) {
        if (report.state !== ReportState.Open) continue;
        if (HIDE_REASONS.has(report.reason.tag)) hideReporters.add(report.reporter.toHexString());
        else if (report.reason.tag === 'outdated') outdatedReports.push({id: report.id, reporter: report.reporter.toHexString()});
    }

    let row = comment;
    if (row.status === CommentStatus.Visible && hideReporters.size >= HIDE_REPORT_THRESHOLD) {
        row = {...row, status: CommentStatus.Hidden};
    }
    if (row.outdatedAt === undefined && new Set(outdatedReports.map(r => r.reporter)).size >= OUTDATED_REPORT_THRESHOLD) {
        row = {...row, outdatedAt: ctx.timestamp, outdatedVersionTag: currentVersionStamp(ctx)};
        for (const {id} of outdatedReports) {
            const report = ctx.db.comment_report.id.find(id);
            if (report !== null) ctx.db.comment_report.id.update({...report, state: ReportState.Actioned, resolvedBy: undefined, resolvedAt: ctx.timestamp});
        }
    }
    if (row !== comment) ctx.db.comment.id.update(row);
}

/** The target of a moderator's action on an account: it must exist and must not be a moderator. */
export function requireModerationTarget(ctx: Ctx, identity: Identity) {
    const account = ctx.db.account.identity.find(identity);
    if (account === null) throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);
    if (ctx.db.moderator.identity.find(identity) !== null) throw new SenderError(CraftError.CANNOT_MODERATE_MODERATOR);
    return account;
}

/** Files the author's `updated` report for a comment whose outdated flag their edit cleared, unless one is already open. */
export function fileUpdatedReport(ctx: Ctx, commentId: bigint): void {
    for (const report of ctx.db.comment_report.commentId.filter(commentId)) {
        if (report.state === ReportState.Open && report.reason.tag === 'updated' && report.reporter.isEqual(ctx.sender)) return;
    }
    ctx.db.comment_report.insert({
        id: 0n,
        commentId,
        reporter: ctx.sender,
        author: ctx.sender,
        reason: {tag: 'updated'},
        note: undefined,
        createdAt: ctx.timestamp,
        state: ReportState.Open,
        resolvedBy: undefined,
        resolvedAt: undefined,
    });
}
