import type {Comment} from "@brico/bindings/brico-app/types";
import type {Accessor} from "solid-js";
import {createContext, useContext} from "solid-js";
import type {ModerationActions} from "~/lib/comments/moderation";
import type {CommentActions} from "~/lib/comments/page";
import type {CommentNode} from "~/lib/comments/tree";

export interface CommentsContextValue {
    pageKey: Accessor<string>;
    actions: CommentActions;
    moderation: ModerationActions;
    isModerator: Accessor<boolean>;
    /**
     * The current node for a comment id. The tree is rebuilt on every live change, so items are
     * keyed by id and look their node up here, which keeps an open reply or edit draft alive.
     */
    node: (id: bigint) => CommentNode<Comment> | undefined;
    /** The signed-in account's vote on a comment: `true` up, `false` down, `undefined` none. */
    myVote: (id: bigint) => boolean | undefined;
    /** The comment the URL hash (`#comment:<id>`) points at. */
    highlightedId: Accessor<bigint | undefined>;
}

/** The hash that links to a comment, and its inverse. */
export const commentHash = (id: bigint) => `#comment:${id}`;
export function parseCommentHash(hash: string): bigint | undefined {
    const match = hash.match(/^#comment:(\d{1,20})$/);
    return match ? BigInt(match[1]) : undefined;
}

export const CommentsContext = createContext<CommentsContextValue>();

export function useComments(): CommentsContextValue {
    const value = useContext(CommentsContext);
    if (!value) throw new Error("useComments: no CommentSection above this component.");
    return value;
}
