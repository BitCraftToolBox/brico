/**
 * page.ts — one page's comment thread: its live subscription, the public count endpoint, and the
 * post/edit/delete/vote calls.
 */
import type {Comment} from "@brico/bindings/brico-app/types";
import {isValidCommentPageKey} from "@brico/crafts/comments";
import {throttle} from "@solid-primitives/scheduled";
import {type Accessor, createEffect, createMemo, createSignal, onCleanup, untrack} from "solid-js";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const REBUILD_INTERVAL_MS = 100;

/** The visible comments of `pageKey`, which is `undefined` until the section is opened. */
export interface PageComments {
    comments: Accessor<Comment[]>;
    /** This page's subscription has applied. Distinct from connection status, which stays `live` across resources. */
    ready: Accessor<boolean>;
    error: Accessor<string | null>;
    reconnect: () => void;
}

/**
 * Subscribes to `user_comments(pageKey)` / `admin_comments(pageKey)` for as long as the caller lives,
 * re-subscribing when the key or role changes. Rows from other pages' subscriptions share the client
 * cache, so every read filters by `pageKey`.
 */
export function createPageComments(pageKey: Accessor<string>, isModerator: Accessor<boolean>): PageComments {
    const connection = useConnection(BRICO_APP_SERVER);
    const [comments, setComments] = createSignal<Comment[]>([]);
    const [ready, setReady] = createSignal(false);

    // A string memo: the effect below re-runs only when the key itself changes.
    const key = createMemo(pageKey);
    let rebuild = () => {};
    const scheduleRebuild = throttle(() => rebuild(), REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRebuild.clear());

    createEffect(() => {
        const current = key();
        const asModerator = isModerator();
        if (!isValidCommentPageKey(current)) return;
        untrack(() => {
            setComments([]);
            setReady(false);
            const view = asModerator ? "admin_comments" : "user_comments";
            const request = connection.requestResource(
                {key: `${asModerator ? "admin-comments" : "comments"}:${current}`, tables: [{table: view, query: `SELECT * FROM ${view}('${current}')`}]},
                scheduleRebuild,
            );
            rebuild = () => {
                const active = connection.active();
                if (!active) return;
                const rows = asModerator ? active.db.adminComments : active.db.userComments;
                setComments(rows.iter().filter(row => row.pageKey === current).toArray());
            };
            // The rows are in the cache the moment the request is ready; don't wait for the throttle.
            createEffect(() => {
                const isReady = request.ready();
                if (isReady) rebuild();
                setReady(isReady);
            });
            onCleanup(() => {
                request.release();
                scheduleRebuild.clear();
            });
        });
    });

    return {comments, ready, error: connection.error, reconnect: connection.reconnect};
}

/**
 * The signed-in account's votes on `pageKey`'s comments, by comment id (`true` up, `false` down;
 * absent means no vote). Subscribes to `my_comment_votes(pageKey)` only while `enabled`.
 */
export function createPageVotes(pageKey: Accessor<string>, enabled: Accessor<boolean>): Accessor<ReadonlyMap<bigint, boolean>> {
    const connection = useConnection(BRICO_APP_SERVER);
    const [votes, setVotes] = createSignal<ReadonlyMap<bigint, boolean>>(new Map());
    const key = createMemo(pageKey);
    const active = createMemo(enabled);
    const scheduleRead = throttle(() => read(), REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRead.clear());
    let read = () => {};

    createEffect(() => {
        const current = key();
        if (!active() || !isValidCommentPageKey(current)) {
            setVotes(new Map());
            return;
        }
        untrack(() => {
            const request = connection.requestResource(
                {key: `comment-votes:${current}`, tables: [{table: "my_comment_votes", query: `SELECT * FROM my_comment_votes('${current}')`}]},
                scheduleRead,
            );
            read = () => {
                const conn = connection.active();
                if (!conn) return;
                const map = new Map<bigint, boolean>();
                for (const row of conn.db.myCommentVotes.iter()) {
                    if (row.pageKey === current) map.set(row.commentId, row.up);
                }
                setVotes(map);
            };
            createEffect(() => {
                if (request.ready()) read();
            });
            onCleanup(() => {
                request.release();
                scheduleRead.clear();
                setVotes(new Map());
            });
        });
    });
    return votes;
}

/** Visible comment count from the public endpoint, or `undefined` if it can't be fetched. */
export async function fetchCommentCount(pageKey: string): Promise<number | undefined> {
    if (!isValidCommentPageKey(pageKey)) return undefined;
    try {
        const response = await fetch(`${BRICO_APP_SERVER.uri}/v1/database/${BRICO_APP_SERVER.module}/route/comments/count?pageKey=${encodeURIComponent(pageKey)}`);
        if (!response.ok) return undefined;
        const body = await response.json() as {count?: unknown};
        return typeof body.count === "number" ? body.count : undefined;
    } catch {
        return undefined;
    }
}

export interface CommentActions {
    /** Resolves to the new comment's id. */
    post: (pageKey: string, parentId: bigint | undefined, body: string) => Promise<bigint>;
    edit: (id: bigint, body: string) => Promise<void>;
    remove: (id: bigint) => Promise<void>;
    /** Sets the caller's vote (`true` up, `false` down) or removes it (`undefined`). */
    vote: (id: bigint, vote: boolean | undefined) => Promise<void>;
}

/** The module calls behind the composer and the comment menu; each rejects with the module's error code. */
export function createCommentActions(): CommentActions {
    const connection = useConnection(BRICO_APP_SERVER);
    const active = () => {
        const conn = connection.active();
        if (!conn) throw new Error("Not connected");
        return conn;
    };
    return {
        post: (pageKey, parentId, body) => active().procedures.postComment({pageKey, parentId, body}),
        edit: async (id, body) => {
            await active().procedures.editComment({id, body});
        },
        remove: async id => {
            await active().reducers.deleteOwnComment({id});
        },
        vote: async (id, vote) => {
            await active().reducers.voteComment({id, vote});
        },
    };
}
