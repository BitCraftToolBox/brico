/** AdminCommentList.tsx — newest-first, filterable, paged comment list backed by `adminListComments`. */
import type {Comment} from "@brico/bindings/brico-app/types";
import {CommentStatus, isValidCommentPageKey} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {useSearchParams} from "@solidjs/router";
import {createEffect, createSignal, For, on, Show} from "solid-js";
import {Identity} from "spacetimedb";
import {AdminCommentRow} from "~/components/comments/admin/AdminCommentRow";
import {Button} from "~/components/ui/button";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {createModerationActions} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";

const ANY_STATUS = "any";

/** A hex identity from the URL, or `undefined` if absent or malformed. */
export function parseIdentityParam(value: string | string[] | undefined): Identity | undefined {
    if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) return undefined;
    return new Identity(value);
}

/** `fixedStatus` pins the status filter (the pending-review page); otherwise it is a dropdown. */
export function AdminCommentList(props: {fixedStatus?: number}) {
    const {_} = useLingui();
    const actions = createModerationActions();
    const [params] = useSearchParams<{identity?: string}>();
    const [status, setStatus] = createSignal(ANY_STATUS);
    const [pageKey, setPageKey] = createSignal("");
    const [rows, setRows] = createSignal<Comment[]>([]);
    const [nextCursor, setNextCursor] = createSignal<bigint | undefined>();
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    // Bumped on each reload so a slow earlier response can't overwrite a newer one.
    let generation = 0;

    const author = () => parseIdentityParam(params.identity);
    const pageKeyFilter = () => isValidCommentPageKey(pageKey().trim()) ? pageKey().trim() : undefined;
    const statusFilter = () => props.fixedStatus ?? (status() === ANY_STATUS ? undefined : Number(status()));

    async function load(cursor: bigint | undefined) {
        const mine = ++generation;
        setLoading(true);
        setError(null);
        try {
            const page = await actions.listComments({status: statusFilter(), author: author(), pageKey: pageKeyFilter()}, cursor);
            if (mine !== generation) return;
            setRows(existing => cursor === undefined ? page.comments : [...existing, ...page.comments]);
            setNextCursor(page.nextCursor);
        } catch (e) {
            if (mine === generation) setError(describeServerError(e));
        } finally {
            if (mine === generation) setLoading(false);
        }
    }

    createEffect(on([status, pageKeyFilter, () => params.identity], () => void load(undefined)));

    return (
        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
                <Show when={props.fixedStatus === undefined}>
                    <select class="h-9 rounded-md border bg-background px-2 text-sm" value={status()} onChange={e => setStatus(e.currentTarget.value)}>
                        <option value={ANY_STATUS}>{_(msg`Any status`)}</option>
                        <option value={CommentStatus.Visible}>{_(msg`Visible`)}</option>
                        <option value={CommentStatus.Pending}>{_(msg`Pending review`)}</option>
                        <option value={CommentStatus.Hidden}>{_(msg`Hidden`)}</option>
                        <option value={CommentStatus.Deleted}>{_(msg`Deleted by author`)}</option>
                    </select>
                </Show>
                <TextField value={pageKey()} onChange={setPageKey} class="w-48">
                    <TextFieldInput class="h-9" placeholder={_(msg`Page, e.g. item:1234`)}/>
                </TextField>
                <Show when={author()}>
                    <span class="text-xs text-muted-foreground"><Trans>Filtered to one author</Trans></span>
                </Show>
            </div>

            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
            <For each={rows()}>{row => <AdminCommentRow initial={row} actions={actions}/>}</For>
            <Show when={!loading() && rows().length === 0 && !error()}>
                <p class="text-sm text-muted-foreground"><Trans>No comments match.</Trans></p>
            </Show>
            <Show when={nextCursor() !== undefined}>
                <Button variant="outline" class="self-start" disabled={loading()} onClick={() => void load(nextCursor())}><Trans>Load more</Trans></Button>
            </Show>
        </div>
    );
}
