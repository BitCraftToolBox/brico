import {checkDisplayName, COMMENT_COOLDOWN_SECONDS, MAX_COMMENTS_PER_HOUR} from '@brico/crafts/comments';
import {CraftError} from '@brico/crafts/errors';
import type {Identity} from 'spacetimedb';
import {type Infer, SenderError} from 'spacetimedb/server';
import type {Ctx, ReadDb} from '../schema';
import {type account} from "../tables/accounts.ts";

type Account = Infer<typeof account.rowType>;

const HOUR_MICROS = 3_600n * 1_000_000n;

/** The oldest active link of `provider` that carries a handle. */
function activeHandle(db: ReadDb, identity: Identity, provider: string): string | undefined {
    let oldest: { linkedAt: bigint; handle: string } | undefined;
    for (const link of db.linked_integration.accountIdentity.filter(identity)) {
        if (link.provider !== provider || link.revokedAt !== undefined || !link.externalHandle) continue;
        const linkedAt = link.linkedAt.microsSinceUnixEpoch;
        if (oldest === undefined || linkedAt < oldest.linkedAt) oldest = {linkedAt, handle: link.externalHandle};
    }
    return oldest?.handle;
}

/**
 * The name a comment is posted under: the account's display name (if it passes `checkDisplayName`),
 * else its oldest active BitCraft handle, else an active Discord handle. `undefined` when none
 * exists. Revoked links are never used, unlike `resolvePayerDisplayName`.
 */
export function resolveAuthorName(db: ReadDb, account: Account): string | undefined {
    if (account.displayName !== undefined) {
        const checked = checkDisplayName(account.displayName);
        if ('name' in checked) return checked.name;
    }
    return activeHandle(db, account.identity, 'bitcraft-rel') ?? activeHandle(db, account.identity, 'discord');
}

/** The NFC-normalized, trimmed name, or a `SenderError` with the code for what is wrong with it. */
export function requireValidDisplayName(input: string): string {
    const checked = checkDisplayName(input.trim());
    if ('problem' in checked) {
        throw new SenderError(checked.problem === 'too-long' ? CraftError.DISPLAY_NAME_TOO_LONG : CraftError.DISPLAY_NAME_INVALID);
    }
    return checked.name;
}

/** Rewrites the snapshot name on every comment the account has authored. */
export function syncAuthorName(ctx: Ctx, identity: Identity, authorName: string): void {
    for (const row of ctx.db.comment.author.filter(identity)) {
        if (row.authorName !== authorName) ctx.db.comment.id.update({...row, authorName});
    }
}

/**
 * Enforces the per-account post cooldown (when `cooldown`) and hourly cap, and records the action.
 * Edits count toward the hourly cap but skip the cooldown, so a typo can be fixed straight away.
 */
export function recordCommentAction(ctx: Ctx, cooldown: boolean): void {
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const row = ctx.db.commenter.identity.find(ctx.sender);
    if (row === null) {
        ctx.db.commenter.insert({identity: ctx.sender, lastPostAt: ctx.timestamp, windowStartedAt: ctx.timestamp, postWindowCount: 1});
        return;
    }
    if (cooldown && now - row.lastPostAt.microsSinceUnixEpoch < BigInt(COMMENT_COOLDOWN_SECONDS) * 1_000_000n) {
        throw new SenderError(CraftError.COMMENT_COOLDOWN);
    }
    const windowExpired = now - row.windowStartedAt.microsSinceUnixEpoch >= HOUR_MICROS;
    const count = windowExpired ? 0 : row.postWindowCount;
    if (count >= MAX_COMMENTS_PER_HOUR) throw new SenderError(CraftError.COMMENT_RATE_LIMITED);
    ctx.db.commenter.identity.update({
        identity: ctx.sender,
        lastPostAt: cooldown ? ctx.timestamp : row.lastPostAt,
        windowStartedAt: windowExpired ? ctx.timestamp : row.windowStartedAt,
        postWindowCount: count + 1,
    });
}
