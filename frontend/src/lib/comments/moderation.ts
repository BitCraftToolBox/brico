/**
 * moderation.ts — moderator detection, the report and moderation calls, and the live report queue.
 * The server enforces every permission; the client only decides what to show.
 */
import {tables} from "@brico/bindings/brico-app";
import type {AdminCommenter, AdminCommentFilters, AdminCommentPage, Comment, CommentReport, CommentReportReason,} from "@brico/bindings/brico-app/types";
import {msg} from "@lingui/core/macro";
import {throttle} from "@solid-primitives/scheduled";
import {type Accessor, createEffect, createMemo, createSignal, onCleanup, untrack} from "solid-js";
import type {Identity, Timestamp} from "spacetimedb";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const REBUILD_INTERVAL_MS = 100;

/** The commenter admin page for an account. */
export const commenterHref = (identity: Identity) => `/admin/comments/commenter?identity=${identity.toHexString()}`;

/** Report reasons offered in the report dialog; `outdated` has its own button and `updated` is filed by the module only. */
export const REPORT_REASONS: {tag: Exclude<CommentReportReason["tag"], "Updated" | "Outdated">; label: ReturnType<typeof msg>}[] = [
    {tag: "Spam", label: msg`Spam`},
    {tag: "Abuse", label: msg`Abusive or harassing`},
    {tag: "OffTopic", label: msg`Off topic`},
    {tag: "BadName", label: msg`Inappropriate display name`},
    {tag: "Other", label: msg`Something else`},
];

/** Every reason, including `outdated` and the module-only `updated`, for displaying a stored report. */
export const REPORT_REASON_LABELS: Record<CommentReportReason["tag"], ReturnType<typeof msg>> = {
    ...Object.fromEntries(REPORT_REASONS.map(reason => [reason.tag, reason.label])) as Record<(typeof REPORT_REASONS)[number]["tag"], ReturnType<typeof msg>>,
    Outdated: msg`Outdated`,
    Updated: msg`Author updated an outdated comment`,
};

/**
 * Whether the signed-in account has a `moderator` row. A boolean memo, so a row rewrite doesn't
 * re-run effects that depend on it.
 */
export function createIsModerator(): Accessor<boolean> {
    const {isLoggedIn} = useAccount();
    const connection = useConnection(BRICO_APP_SERVER);
    const [moderator, setModerator] = createSignal(false);

    createEffect(() => {
        if (!isLoggedIn()) {
            setModerator(false);
            return;
        }
        untrack(() => {
            const read = () => setModerator((connection.active()?.db.myModerator.count() ?? 0n) > 0n);
            const request = connection.requestResource({key: "moderator:self", tables: [bricoAppTable(tables.myModerator)]}, read);
            onCleanup(() => request.release());
        });
    });
    return createMemo(moderator);
}

/** The open reports (moderators only), updated live. */
export function createOpenReports(): {reports: Accessor<CommentReport[]>; ready: Accessor<boolean>} {
    const connection = useConnection(BRICO_APP_SERVER);
    const [reports, setReports] = createSignal<CommentReport[]>([]);
    const [ready, setReady] = createSignal(false);

    const rebuild = throttle(() => setReports(connection.active()?.db.adminOpenReports.iter().toArray() ?? []), REBUILD_INTERVAL_MS);
    onCleanup(() => rebuild.clear());
    const request = connection.requestResource({key: "moderation:open-reports", tables: [bricoAppTable(tables.adminOpenReports)]}, rebuild);
    createEffect(() => {
        const isReady = request.ready();
        if (isReady) rebuild();
        setReady(isReady);
    });
    onCleanup(() => request.release());
    return {reports, ready};
}

/** The prior bodies of one comment (moderators only), subscribed while the caller lives. */
export function createCommentRevisions(commentId: bigint) {
    const connection = useConnection(BRICO_APP_SERVER);
    const [revisions, setRevisions] = createSignal<ReturnType<typeof readRevisions>>([]);
    const [ready, setReady] = createSignal(false);

    function readRevisions() {
        return (connection.active()?.db.adminCommentRevisions.iter().toArray() ?? [])
            .filter(row => row.commentId === commentId)
            .sort((a, b) => (a.editedAt.microsSinceUnixEpoch < b.editedAt.microsSinceUnixEpoch ? 1 : -1));
    }

    const rebuild = throttle(() => setRevisions(readRevisions()), REBUILD_INTERVAL_MS);
    onCleanup(() => rebuild.clear());
    const request = connection.requestResource(
        {key: `moderation:revisions:${commentId}`, tables: [{table: "admin_comment_revisions", query: `SELECT * FROM admin_comment_revisions(${commentId})`}]},
        rebuild,
    );
    // Read the snapshot synchronously when ready flips; the throttled rebuild would leave `ready`
    // true with no revisions for its delay.
    createEffect(() => {
        const isReady = request.ready();
        if (isReady) {
            rebuild.clear();
            setRevisions(readRevisions());
        }
        setReady(isReady);
    });
    onCleanup(() => request.release());
    return {revisions, ready};
}

export interface ReportInput {
    id: bigint;
    reason: Exclude<CommentReportReason["tag"], "Updated">;
    note: string | undefined;
}

/** The restrictions `setAccountPermissions` replaces; `undefined` clears one. */
export interface AccountPermissionsInput {
    identity: Identity;
    postBlockedUntil: Timestamp | undefined;
    reviewRequiredUntil: Timestamp | undefined;
    nameLockedUntil: Timestamp | undefined;
    reportBlockedUntil: Timestamp | undefined;
    reason: string | undefined;
}

export interface ModerationActions {
    report: (input: ReportInput) => Promise<void>;
    setStatus: (id: bigint, status: number) => Promise<void>;
    setOutdated: (id: bigint, outdated: boolean) => Promise<void>;
    resolveReport: (id: bigint, state: number) => Promise<void>;
    setPermissions: (input: AccountPermissionsInput) => Promise<void>;
    setDisplayName: (identity: Identity, displayName: string) => Promise<void>;
    hideAllBy: (identity: Identity) => Promise<void>;
    listComments: (filters: AdminCommentFilters, cursor: bigint | undefined) => Promise<AdminCommentPage>;
    getComments: (ids: bigint[]) => Promise<Comment[]>;
    getCommenter: (identity: Identity) => Promise<AdminCommenter>;
}

/** The module calls behind the report dialog and the moderator controls; each rejects with the module's error code. */
export function createModerationActions(): ModerationActions {
    const connection = useConnection(BRICO_APP_SERVER);
    const active = () => {
        const conn = connection.active();
        if (!conn) throw new Error("Not connected");
        return conn;
    };
    return {
        report: async ({id, reason, note}) => {
            await active().reducers.reportComment({id, reason: {tag: reason}, note});
        },
        setStatus: async (id, status) => {
            await active().reducers.setCommentStatus({id, status});
        },
        setOutdated: async (id, outdated) => {
            await active().reducers.setCommentOutdated({id, outdated});
        },
        resolveReport: async (id, state) => {
            await active().reducers.resolveReport({id, state});
        },
        setPermissions: async input => {
            await active().reducers.setAccountPermissions(input);
        },
        setDisplayName: async (identity, displayName) => {
            await active().reducers.moderatorSetDisplayName({identity, displayName});
        },
        hideAllBy: async identity => {
            await active().reducers.hideAllByCommenter({identity});
        },
        listComments: (filters, cursor) => active().procedures.adminListComments({cursor, filters}),
        getComments: ids => active().procedures.adminGetComments({ids}),
        getCommenter: identity => active().procedures.adminGetCommenter({identity}),
    };
}
