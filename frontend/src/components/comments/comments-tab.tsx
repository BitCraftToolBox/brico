/**
 * comments-tab.tsx — the "Comments" tab `DetailPageLayout` appends to every detail page. The tab
 * count comes from the module's public count endpoint, so the thread itself (and the Markdown
 * renderer) loads only when the tab opens.
 */
import {commentPageKey, isValidCommentPageKey} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {type Accessor, createEffect, createMemo, createSignal, lazy, on, Suspense} from "solid-js";
import type {RelationshipTab} from "~/components/shared/DetailPageLayout";
import {Skeleton} from "~/components/ui/skeleton";
import {fetchCommentCount} from "~/lib/comments/page";

const CommentSection = lazy(() => import("~/components/comments/CommentSection"));

/**
 * `"<route segment>:<id>"` for a detail page, from its list page's href and object id; `undefined`
 * when the page has no usable pair (comments are then not offered).
 */
export function detailPageCommentKey(breadcrumbHref: string | undefined, objectId: string | number | undefined): string | undefined {
    const kind = breadcrumbHref?.split("/").filter(Boolean).pop();
    if (kind === undefined || objectId === undefined || !/^\d+$/.test(String(objectId))) return undefined;
    const key = commentPageKey(kind, objectId);
    return isValidCommentPageKey(key) ? key : undefined;
}

/**
 * The Comments tab for `pageKey`, or `undefined` when the page has none.
 *
 * Kobalte selects the first enabled tab on its own, so when Comments is the only one it would open
 * (and subscribe) on every such page. `otherTabs` and `requested` (the URL asked for this tab) let
 * the section hold back behind a button in that case.
 */
export function createCommentsTab(options: {
    pageKey: Accessor<string | undefined>;
    otherTabs: Accessor<boolean>;
    requested: boolean;
}): Accessor<RelationshipTab | undefined> {
    const [count, setCount] = createSignal<number | undefined>();

    // `createEffect` never runs on the server, so the fetch is client-only and SSR renders no count.
    createEffect(on(options.pageKey, key => {
        setCount(undefined);
        if (key === undefined) return;
        void fetchCommentCount(key).then(fetched => {
            if (options.pageKey() === key && fetched !== undefined) setCount(fetched);
        });
    }));

    const deferred = createMemo(() => !options.otherTabs() && !options.requested);

    return createMemo(() => {
        const key = options.pageKey();
        if (key === undefined) return undefined;
        return {
            id: "comments",
            label: msg`Comments`,
            // A getter keeps the tab object stable across count changes, so the section isn't remounted.
            get count() {
                return count();
            },
            alwaysEnabled: true,
            content: () => (
                <Suspense fallback={<Skeleton class="h-24 w-full"/>}>
                    <CommentSection pageKey={key} deferred={deferred()} initialCount={count()} onCount={setCount}/>
                </Suspense>
            ),
        } satisfies RelationshipTab;
    });
}
