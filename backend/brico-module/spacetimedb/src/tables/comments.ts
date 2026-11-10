import {t, table} from 'spacetimedb/server';

/**
 * One comment on a database detail page. A page "exists" only through its rows: there is no page
 * table, and `pageKey` is checked by `isValidCommentPageKey`, not against game data.
 */
export const comment = table(
    {name: 'comment'},
    {
        id: t.u64().primaryKey().autoInc(),
        /** `"<route segment>:<id>"`. A single indexed string because views can only read through indexed lookups. */
        pageKey: t.string().index('btree'),
        parentId: t.option(t.u64()),
        /** 0 = top level; at most `MAX_COMMENT_DEPTH`. */
        depth: t.u8(),
        author: t.identity().index('btree'),
        /** Snapshot resolved when posting (see `resolveAuthorName`); never empty. */
        authorName: t.string(),
        /** Markdown. Kept for hidden and deleted rows. */
        body: t.string(),
        /** A `CommentStatus` code. */
        status: t.u8(),
        createdAt: t.timestamp(),
        /** The data version current when posted; null if it could not be determined. */
        versionTag: t.option(t.string()),
        editedAt: t.option(t.timestamp()),
        editedVersionTag: t.option(t.string()),
        outdatedAt: t.option(t.timestamp()),
        outdatedVersionTag: t.option(t.string()),
        /** Upvotes minus downvotes, kept in step with `comment_vote` by `voteComment`. */
        score: t.i32().default(0),
    }
);

/**
 * One account's vote on a comment: `up` true for +1, false for -1; no row means no vote. `pageKey`
 * copies the comment's so `my_comment_votes` can return one page's votes through an index.
 */
export const comment_vote = table(
    {
        name: 'comment_vote',
        indexes: [{accessor: 'by_voter_comment', algorithm: 'btree', columns: ['voter', 'commentId']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        commentId: t.u64().index('btree'),
        pageKey: t.string().index('btree'),
        voter: t.identity(),
        up: t.bool(),
    }
);

/** The prior body of an edited comment, written on every edit. */
export const comment_revision = table(
    {name: 'comment_revision'},
    {
        id: t.u64().primaryKey().autoInc(),
        commentId: t.u64().index('btree'),
        body: t.string(),
        editedAt: t.timestamp(),
        editor: t.identity(),
        versionTag: t.option(t.string()),
    }
);

/**
 * Posting rate-limit state, one row per account that has posted. Separate from `account`, whose
 * row is rewritten on every connect.
 */
export const commenter = table(
    {name: 'commenter'},
    {
        identity: t.identity().primaryKey(),
        lastPostAt: t.timestamp(),
        windowStartedAt: t.timestamp(),
        postWindowCount: t.u32(),
    }
);

/**
 * Moderator-set restrictions on one account; an absent row, an unset column or a past timestamp
 * means no restriction. Audit fields come first because defaulted columns can only be appended.
 */
export const account_permission = table(
    {name: 'account_permission'},
    {
        identity: t.identity().primaryKey(),
        reason: t.option(t.string()),
        updatedBy: t.identity(),
        updatedAt: t.timestamp(),
        postBlockedUntil: t.option(t.timestamp()),
        reviewRequiredUntil: t.option(t.timestamp()),
        nameLockedUntil: t.option(t.timestamp()),
        reportBlockedUntil: t.option(t.timestamp()),
    }
);

/** Singleton (`id` 0): cereal's `latest.json` as last fetched: the latest data `tag` and the `releaseLabel` (as `label`). */
export const game_version_cache = table(
    {name: 'game_version_cache'},
    {
        id: t.u8().primaryKey(),
        tag: t.string(),
        label: t.option(t.string()),
        fetchedAt: t.timestamp(),
    }
);

/** Why a comment was reported. `updated` is filed only by `editComment`, when an author edits an outdated-flagged comment. */
export const CommentReportReason = t.enum('CommentReportReason', {
    spam: t.unit(),
    abuse: t.unit(),
    offTopic: t.unit(),
    badName: t.unit(),
    outdated: t.unit(),
    updated: t.unit(),
    other: t.unit(),
});

/** A report on a comment. At most one open row per `(commentId, reporter, reason)`, enforced in `reportComment`. */
export const comment_report = table(
    {name: 'comment_report'},
    {
        id: t.u64().primaryKey().autoInc(),
        commentId: t.u64().index('btree'),
        reporter: t.identity().index('btree'),
        author: t.identity().index('btree'),
        reason: CommentReportReason,
        note: t.option(t.string()),
        createdAt: t.timestamp(),
        /** A `ReportState` code. */
        state: t.u8(),
        resolvedBy: t.option(t.identity()),
        resolvedAt: t.option(t.timestamp()),
    }
);

/** Accounts that may moderate comments. Written only by a service principal. */
export const moderator = table(
    {name: 'moderator'},
    {
        identity: t.identity().primaryKey(),
        grantedBy: t.identity(),
        grantedAt: t.timestamp(),
    }
);
