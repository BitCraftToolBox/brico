/** `/admin/comments/reports` — open reports grouped by comment, live. */
import type {Comment, CommentReport} from "@brico/bindings/brico-app/types";
import {CommentStatus, ReportState} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createEffect, createMemo, createSignal, For, on, Show} from "solid-js";
import {AdminCommentRow} from "~/components/comments/admin/AdminCommentRow";
import {AdminLayout} from "~/components/comments/admin/AdminLayout";
import {CommentTime} from "~/components/comments/CommentTime";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {commenterHref, createModerationActions, createOpenReports, REPORT_REASON_LABELS} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";

function ReportGroup(props: {comment: Comment | undefined; reports: CommentReport[]}) {
    const {_} = useLingui();
    const actions = createModerationActions();
    const [error, setError] = createSignal<string | null>(null);

    async function resolveAll(state: number, hide: boolean) {
        setError(null);
        try {
            const id = props.reports[0].commentId;
            if (hide) await actions.setStatus(id, CommentStatus.Hidden);
            for (const report of props.reports) await actions.resolveReport(report.id, state);
        } catch (e) {
            setError(describeServerError(e));
        }
    }

    return (
        <div class="flex flex-col gap-2">
            <Show when={props.comment} fallback={<p class="text-sm italic text-muted-foreground"><Trans>Comment not found.</Trans></p>}>
                {comment => <AdminCommentRow initial={comment()} actions={actions}/>}
            </Show>
            <ul class="flex flex-col gap-1 pl-3 text-sm">
                <For each={props.reports}>
                    {report => (
                        <li class="flex flex-wrap items-baseline gap-2">
                            <Badge variant="secondary">{_(REPORT_REASON_LABELS[report.reason.tag])}</Badge>
                            <Show when={report.note}>{note => <span>{note()}</span>}</Show>
                            <span class="text-xs text-muted-foreground">
                                <A href={commenterHref(report.reporter)} class="underline"><Trans>Reporter</Trans></A>
                                {" · "}<CommentTime at={report.createdAt}/>
                            </span>
                        </li>
                    )}
                </For>
            </ul>
            <div class="flex flex-wrap gap-2 pl-3">
                <Button variant="outline" size="sm" onClick={() => void resolveAll(ReportState.Dismissed, false)}><Trans>Dismiss</Trans></Button>
                <Button variant="outline" size="sm" onClick={() => void resolveAll(ReportState.Actioned, false)}><Trans>Mark actioned</Trans></Button>
                <Show when={props.comment?.status !== CommentStatus.Hidden}>
                    <Button variant="destructive" size="sm" onClick={() => void resolveAll(ReportState.Actioned, true)}><Trans>Hide and resolve</Trans></Button>
                </Show>
            </div>
            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
        </div>
    );
}

export default function AdminReportsPage() {
    return (
        <AdminLayout>
            <ReportQueue/>
        </AdminLayout>
    );
}

function ReportQueue() {
    const {_} = useLingui();
    const actions = createModerationActions();
    const {reports, ready} = createOpenReports();
    const [reason, setReason] = createSignal("any");
    const [comments, setComments] = createSignal(new Map<bigint, Comment>());
    const [error, setError] = createSignal<string | null>(null);

    // Comment text isn't in a live view, so it is fetched whenever the set of reported ids changes (a string memo).
    const idKey = createMemo(() => [...new Set(reports().map(report => report.commentId))].sort().join(","));
    createEffect(on(idKey, async key => {
        if (key === "") return;
        try {
            const rows = await actions.getComments(key.split(",").map(BigInt));
            setComments(new Map(rows.map(row => [row.id, row])));
        } catch (e) {
            setError(describeServerError(e));
        }
    }));

    const groups = createMemo(() => {
        const byComment = new Map<bigint, CommentReport[]>();
        for (const report of reports()) {
            if (reason() !== "any" && report.reason.tag !== reason()) continue;
            byComment.set(report.commentId, [...(byComment.get(report.commentId) ?? []), report]);
        }
        return [...byComment.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
    });

    return (
        <div class="flex flex-col gap-4">
            <select class="h-9 self-start rounded-md border bg-background px-2 text-sm" value={reason()} onChange={e => setReason(e.currentTarget.value)}>
                <option value="any">{_(msg`Any reason`)}</option>
                <For each={Object.entries(REPORT_REASON_LABELS)}>{([tag, label]) => <option value={tag}>{_(label)}</option>}</For>
            </select>
            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
            <Show when={ready()} fallback={<p class="text-sm text-muted-foreground"><Trans>Loading…</Trans></p>}>
                <Show when={groups().length > 0} fallback={<p class="text-sm text-muted-foreground"><Trans>No open reports.</Trans></p>}>
                    <For each={groups()}>{([id, group]) => <ReportGroup comment={comments().get(id)} reports={group}/>}</For>
                </Show>
            </Show>
        </div>
    );
}
