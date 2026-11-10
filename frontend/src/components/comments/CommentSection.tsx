/**
 * CommentSection.tsx — a database page's comment thread, shown as the content of its Comments tab.
 * Subscribes only once it is open: `deferred` holds the subscription back behind a button for pages
 * where the tab is selected without the reader asking for it.
 */
import type {Comment} from "@brico/bindings/brico-app/types";
import {CommentStatus} from "@brico/crafts/comments";
import {Plural, Trans} from "@lingui/solid/macro";
import {useLocation} from "@solidjs/router";
import {createEffect, createMemo, createSignal, For, Show} from "solid-js";
import {CommentComposer} from "~/components/comments/CommentComposer";
import {CommentItem} from "~/components/comments/CommentItem";
import {CommentsContext, parseCommentHash} from "~/components/comments/context";
import {Button} from "~/components/ui/button";
import {Skeleton} from "~/components/ui/skeleton";
import {useAccount} from "~/lib/account/state";
import {createIsModerator, createModerationActions} from "~/lib/comments/moderation";
import {createCommentActions, createPageComments, createPageVotes} from "~/lib/comments/page";
import {buildCommentTree, type CommentNode, type TopLevelOrder} from "~/lib/comments/tree";
import {cn} from "~/lib/utils";

export interface CommentSectionProps {
    pageKey: string;
    /** Wait for a click before subscribing. */
    deferred?: boolean;
    /** The count from the public endpoint, shown on the button while deferred. */
    initialCount?: number;
    /** Called with the live visible-comment count once the subscription has applied. */
    onCount?: (count: number) => void;
}

export default function CommentSection(props: CommentSectionProps) {
    const [opened, setOpened] = createSignal(false);
    return (
        <Show
            when={!props.deferred || opened()}
            fallback={
                <Button variant="outline" onClick={() => setOpened(true)}>
                    <Show when={props.initialCount !== undefined} fallback={<Trans>Show comments</Trans>}>
                        <Trans>Show comments ({props.initialCount})</Trans>
                    </Show>
                </Button>
            }
        >
            <OpenSection {...props}/>
        </Show>
    );
}

function OpenSection(props: CommentSectionProps) {
    const actions = createCommentActions();
    const moderation = createModerationActions();
    const isModerator = createIsModerator();
    const {isLoggedIn} = useAccount();
    const {comments, ready} = createPageComments(() => props.pageKey, isModerator);
    const votes = createPageVotes(() => props.pageKey, isLoggedIn);
    const [order, setOrder] = createSignal<TopLevelOrder>("score");
    const tree = createMemo(() => buildCommentTree(comments(), order()));
    const index = createMemo(() => {
        const nodes = new Map<bigint, CommentNode<Comment>>();
        const walk = (node: CommentNode<Comment>) => {
            nodes.set(node.id, node);
            node.children.forEach(walk);
        };
        tree().forEach(walk);
        return nodes;
    });
    const rootIds = () => tree().map(node => node.id);

    // Scrolls when the hash changes or its comment first appears, not on every live update (`targetPresent` is a boolean memo).
    const location = useLocation();
    const highlightedId = createMemo(() => parseCommentHash(location.hash));
    const targetPresent = createMemo(() => {
        const id = highlightedId();
        return id !== undefined && ready() && index().has(id);
    });
    createEffect(() => {
        const id = highlightedId();
        if (id === undefined || !targetPresent()) return;
        // After the rows for this render have mounted.
        queueMicrotask(() => document.getElementById(`comment:${id}`)?.scrollIntoView({block: "center", behavior: "smooth"}));
    });

    // The count is a number, so the effect only re-runs when it changes. Moderators also receive
    // hidden and pending rows, which the public count leaves out.
    const count = createMemo(() => comments().filter(row => row.status === CommentStatus.Visible).length);
    createEffect(() => {
        if (ready()) props.onCount?.(count());
    });

    return (
        <CommentsContext.Provider value={{pageKey: () => props.pageKey, actions, moderation, isModerator, node: id => index().get(id), myVote: id => votes().get(id), highlightedId}}>
            <div class="flex flex-col gap-4">
                <div class="flex items-center justify-between gap-2 border-b pb-2">
                    <h3 class="text-sm font-medium">
                        <Show when={ready()} fallback={<Trans>Comments</Trans>}>
                            <Plural value={count()} one="# comment" other="# comments"/>
                        </Show>
                    </h3>
                    <div class="inline-flex rounded-md bg-muted p-0.5 text-xs">
                        <button type="button" class={cn("rounded px-2 py-1", order() === "score" && "bg-background shadow-sm")} onClick={() => setOrder("score")}><Trans>Score</Trans></button>
                        <button type="button" class={cn("rounded px-2 py-1", order() === "newest" && "bg-background shadow-sm")} onClick={() => setOrder("newest")}><Trans>Newest</Trans></button>
                        <button type="button" class={cn("rounded px-2 py-1", order() === "oldest" && "bg-background shadow-sm")} onClick={() => setOrder("oldest")}><Trans>Oldest</Trans></button>
                    </div>
                </div>

                <Show
                    when={ready()}
                    fallback={
                        <div class="flex flex-col gap-3">
                            <Skeleton class="h-12 w-full"/>
                            <Skeleton class="h-12 w-3/4"/>
                        </div>
                    }
                >
                    <Show when={rootIds().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No comments yet.</Trans></p>}>
                        <div class="flex flex-col gap-4">
                            <For each={rootIds()}>{id => <CommentItem id={id}/>}</For>
                        </div>
                    </Show>
                </Show>

                <CommentComposer
                    submitLabel={<Trans>Post</Trans>}
                    onSubmit={async body => {
                        await actions.post(props.pageKey, undefined, body);
                    }}
                />
            </div>
        </CommentsContext.Provider>
    );
}
