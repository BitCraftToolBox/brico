import {CommentStatus} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import {encodeNotificationPayload} from '@brico/crafts/notification';
import type {Identity} from 'spacetimedb';
import type {Infer} from 'spacetimedb/server';
import {SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';
import type {comment} from '../tables/comments';
import type {NotifySinkRef} from '../tables/notify';

type Sink = Infer<typeof NotifySinkRef>;

/** Throws unless a Discord `sink` is one of `account`'s live notification sinks; a toast sink always passes. */
export function requireOwnDiscordSink(ctx: Ctx, account: Identity, sink: Sink): void {
    if (sink.tag !== 'discord') return;
    const discordSink = ctx.db.discord_notify_sink.id.find(sink.value.sinkId);
    if (discordSink === null || !discordSink.accountIdentity.isEqual(account) || discordSink.deletedAt !== undefined) {
        throw new SenderError(CraftError.UNKNOWN_DISCORD_NOTIFY_SINK);
    }
}

/** `account`'s live comment trigger for the toast sink, if any. */
export function findCommentToastTrigger(ctx: Ctx, account: Identity) {
    for (const row of ctx.db.comment_notify_trigger.accountIdentity.filter(account)) {
        if (row.deletedAt === undefined && row.sink.tag === 'toast') return row;
    }
    return null;
}

/**
 * Notifies the author of `reply`'s parent, unless the parent is not visible, the author replied to
 * themselves, or they turned reply toasts off. Call when a reply becomes visible.
 */
export function notifyCommentReply(ctx: Ctx, reply: Infer<typeof comment.rowType>): void {
    if (reply.parentId === undefined) return;
    const parent = ctx.db.comment.id.find(reply.parentId);
    if (parent === null || parent.status !== CommentStatus.Visible || parent.author.isEqual(reply.author)) return;
    if (ctx.db.account.identity.find(parent.author) === null) return;
    if (findCommentToastTrigger(ctx, parent.author)?.reply === false) return;

    ctx.db.notification_v2.insert({
        id: 0n,
        accountIdentity: parent.author,
        payloadJson: encodeNotificationPayload({
            tag: 'comment',
            value: {senderName: reply.authorName, pageKey: reply.pageKey, commentId: reply.id.toString()},
        }),
        createdAt: ctx.timestamp,
        readAt: undefined,
    });
}

/** `account`'s live funding trigger for `sink`, if any. */
export function findFundingTrigger(ctx: Ctx, account: Identity, sink: Sink) {
    for (const row of ctx.db.funding_notify_trigger.accountIdentity.filter(account)) {
        if (row.deletedAt !== undefined || row.sink.tag !== sink.tag) continue;
        if (row.sink.tag === 'discord' && sink.tag === 'discord' && row.sink.value.sinkId !== sink.value.sinkId) continue;
        return row;
    }
    return null;
}
