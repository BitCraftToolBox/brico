/** AdminCommentRow.tsx — one comment on an admin list, with the in-place moderator controls and a link to its page. */
import type {Comment} from "@brico/bindings/brico-app/types";
import {CommentStatus} from "@brico/crafts/comments";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createSignal, Show} from "solid-js";
import {Markdown} from "~/components/comments/Markdown";
import {ModeratorControls} from "~/components/comments/ModeratorControls";
import {VersionBadge} from "~/components/comments/VersionBadge";
import {Badge} from "~/components/ui/badge";
import {commenterHref, type ModerationActions} from "~/lib/comments/moderation";
import {resolveCommentPage} from "~/lib/comments/page-target";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {IconLink, pageIcon} from "~/lib/game-links";

/** Links to the comment's database entry, opened on the comment; the raw key in red when it doesn't resolve. */
function PageLink(props: {row: Comment}) {
    const target = () => resolveCommentPage(props.row.pageKey);
    return (
        <Show when={target()} fallback={<span class="text-destructive">{props.row.pageKey}</span>}>
            {t => (
                <IconLink href={`${t().href}?detail=comments#comment:${props.row.id}`} icon={pageIcon(t().title)}>{t().name}</IconLink>
            )}
        </Show>
    );
}

/** Shows `initial` and reloads it from the module after each action, since the lists aren't live. */
export function AdminCommentRow(props: {initial: Comment; actions: ModerationActions}) {
    const [row, setRow] = createSignal(props.initial);
    const [error, setError] = createSignal<string | null>(null);

    async function refresh() {
        try {
            const [updated] = await props.actions.getComments([row().id]);
            if (updated) setRow(updated);
        } catch (e) {
            setError(describeServerError(e));
        }
    }

    return (
        <div class="flex flex-col gap-1 rounded-md border p-3">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <A href={commenterHref(row().author)} class="text-sm font-medium text-foreground hover:underline">{row().authorName}</A>
                <VersionBadge
                    tag={row().versionTag}
                    at={row().createdAt}
                    outdated={row().outdatedAt ? {at: row().outdatedAt!, tag: row().outdatedVersionTag} : undefined}
                />
                <PageLink row={row()}/>
                <Show when={row().status !== CommentStatus.Visible}>
                    <Badge variant="outline" class="h-5 text-[10px]">
                        <Show when={row().status === CommentStatus.Pending}><Trans>Pending review</Trans></Show>
                        <Show when={row().status === CommentStatus.Hidden}><Trans>Hidden</Trans></Show>
                        <Show when={row().status === CommentStatus.Deleted}><Trans>Deleted by author</Trans></Show>
                    </Badge>
                </Show>
            </div>
            <Markdown source={row().body}/>
            <Show when={row().editedAt}>{at => <div><VersionBadge edited tag={row().editedVersionTag} at={at()}/></div>}</Show>
            <div class="flex flex-wrap items-center gap-1">
                <ModeratorControls row={row()} actions={props.actions} onError={setError} onDone={() => void refresh()}/>
            </div>
            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
        </div>
    );
}
