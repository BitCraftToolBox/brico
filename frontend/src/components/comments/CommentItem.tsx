/** CommentItem.tsx — one comment and, recursively, its replies. */
import type {Comment} from "@brico/bindings/brico-app/types";
import {CommentStatus, MAX_COMMENT_DEPTH} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {A, useLocation} from "@solidjs/router";
import {
    TbOutlineChevronDown as IconDown,
    TbOutlineChevronUp as IconUp,
    TbOutlineClipboardCheck as IconCopied,
    TbOutlineClipboardText as IconCopy,
    TbOutlineClock as IconOutdated,
    TbOutlineCornerDownLeft as IconReply,
    TbOutlineHistory as IconHistory,
    TbOutlineMessageReport as IconReport,
    TbOutlinePencil as IconEdit,
    TbOutlineTrash as IconDelete,
} from "solid-icons/tb";
import {createSignal, For, Show} from "solid-js";
import {CommentComposer} from "~/components/comments/CommentComposer";
import {commentHash, useComments} from "~/components/comments/context";
import {Markdown} from "~/components/comments/Markdown";
import {RevisionHistory, statusToggle, useStatusToggleLook} from "~/components/comments/ModeratorControls";
import {ReportDialog} from "~/components/comments/ReportDialog";
import {ToolbarButton} from "~/components/comments/ToolbarButton";
import {VersionBadge} from "~/components/comments/VersionBadge";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {showToast} from "~/components/ui/toast";
import {useAccount} from "~/lib/account/state";
import {commenterHref} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {useSettings} from "~/lib/settings.tsx";
import {cn, useCopy} from "~/lib/utils";

type Confirmation = "delete" | "outdated" | "clearOutdated" | "reportOutdated";

export function CommentItem(props: {id: bigint; nested?: boolean}) {
    const {_} = useLingui();
    const statusLook = useStatusToggleLook();
    const {devMenusEnabled} = useSettings();
    const {account, isLoggedIn} = useAccount();
    const location = useLocation();
    const {pageKey, actions, moderation, isModerator, node: nodeFor, myVote, highlightedId} = useComments();
    const node = () => nodeFor(props.id);
    const childIds = () => node()?.children.map(child => child.id) ?? [];

    const [replying, setReplying] = createSignal(false);
    const [reporting, setReporting] = createSignal(false);
    const [editing, setEditing] = createSignal(false);
    const [confirming, setConfirming] = createSignal<Confirmation>();
    const [showHistory, setShowHistory] = createSignal(false);
    const [collapsed, setCollapsed] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [copyMarkdown, markdownCopied] = useCopy(() => node()?.row?.body ?? "");

    const isOwn = (row: Comment) => account()?.identity.isEqual(row.author) ?? false;
    const isLive = (row: Comment) => row.status === CommentStatus.Visible || row.status === CommentStatus.Pending;
    const canEdit = (row: Comment) => isModerator() || (isOwn(row) && isLive(row));
    const canDelete = (row: Comment) => isOwn(row) && isLive(row);
    // Authors and moderators set the flag directly; other readers report it, and only while it isn't set.
    const canSetOutdated = (row: Comment) => isModerator() || (isOwn(row) && isLive(row) && row.outdatedAt === undefined);
    const canReportOutdated = (row: Comment) =>
        isLoggedIn() && !isOwn(row) && row.status === CommentStatus.Visible && row.outdatedAt === undefined;
    const outdatedLabel = (row: Comment) => {
        if (row.outdatedAt !== undefined) return _(msg`Clear outdated`);
        return canSetOutdated(row) ? _(msg`Mark as outdated`) : _(msg`Report as outdated`);
    };
    const confirmPrompt = (kind: Confirmation) => {
        switch (kind) {
            case "delete": return _(msg`Delete this comment?`);
            case "outdated": return _(msg`Mark this comment as outdated?`);
            case "clearOutdated": return _(msg`Clear the outdated flag?`);
            case "reportOutdated": return _(msg`Report this comment as outdated?`);
        }
    };

    async function act(action: () => Promise<void>) {
        setError(null);
        try {
            await action();
        } catch (e) {
            setError(describeServerError(e));
        }
    }

    // Clicking the active direction removes the vote; the other direction changes it.
    function VoteButton(voteProps: {direction: "up" | "down"; row: Comment}) {
        const up = () => voteProps.direction === "up";
        const active = () => myVote(voteProps.row.id) === up();
        const label = () => up() ? _(msg`Upvote`) : _(msg`Downvote`);
        return (
            <Show when={isLoggedIn()} fallback={<span class="size-5"/>}>
                <button
                    type="button"
                    class={cn("rounded p-0.5 hover:text-foreground disabled:pointer-events-none disabled:opacity-40", active() && "text-primary")}
                    aria-label={label()}
                    aria-pressed={active()}
                    title={isOwn(voteProps.row) ? _(msg`You can't vote on your own comment.`) : label()}
                    disabled={isOwn(voteProps.row)}
                    onClick={() => void act(() => actions.vote(voteProps.row.id, active() ? undefined : up()))}
                >
                    <Show when={up()} fallback={<IconDown class="size-4"/>}><IconUp class="size-4"/></Show>
                </button>
            </Show>
        );
    }

    async function confirmed(row: Comment, kind: Confirmation) {
        switch (kind) {
            case "delete":
                await act(() => actions.remove(row.id));
                break;
            case "outdated":
            case "clearOutdated":
                await act(() => moderation.setOutdated(row.id, kind === "outdated"));
                break;
            case "reportOutdated":
                await act(async () => {
                    await moderation.report({id: row.id, reason: "Outdated", note: undefined});
                    showToast({title: () => _(msg`Report sent`), variant: "success"});
                });
                break;
        }
        setConfirming(undefined);
    }

    return (
        <div id={`comment:${props.id}`} class={cn("flex flex-col gap-2", props.nested && "border-l pl-3")}>
            <Show when={node()?.row} fallback={<p class="text-sm italic text-muted-foreground"><Trans>[removed]</Trans></p>}>
                {row => (
                    <div class="flex gap-2">
                        <div class="flex w-6 shrink-0 flex-col items-center text-muted-foreground">
                            <VoteButton direction="up" row={row()}/>
                            <span class="text-xs font-medium tabular-nums text-foreground" aria-label={_(msg`Score`)}>{row().score}</span>
                            <VoteButton direction="down" row={row()}/>
                        </div>
                        <div class={cn("flex min-w-0 flex-1 flex-col gap-1 rounded-md transition-colors", highlightedId() === row().id && "bg-accent/60 ring-2 ring-accent")}>
                            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                <Show when={isModerator()} fallback={<span class="text-sm font-medium text-foreground">{row().authorName}</span>}>
                                    <A href={commenterHref(row().author)} class="text-sm font-medium text-foreground hover:underline">{row().authorName}</A>
                                </Show>
                                <VersionBadge
                                    tag={row().versionTag}
                                    at={row().createdAt}
                                    href={`${location.pathname}?detail=comments${commentHash(row().id)}`}
                                    outdated={row().outdatedAt ? {at: row().outdatedAt!, tag: row().outdatedVersionTag} : undefined}
                                />
                                <Show when={row().status !== CommentStatus.Visible}>
                                    <Badge variant="outline" class="h-5 text-[10px]">
                                        <Show when={row().status === CommentStatus.Pending}><Trans>Pending review</Trans></Show>
                                        <Show when={row().status === CommentStatus.Hidden}><Trans>Hidden</Trans></Show>
                                        <Show when={row().status === CommentStatus.Deleted}><Trans>Deleted by author</Trans></Show>
                                    </Badge>
                                </Show>
                            </div>

                            <Show
                                when={!editing()}
                                fallback={
                                    <CommentComposer
                                        autofocus
                                        moderating={!isOwn(row())}
                                        initialBody={row().body}
                                        submitLabel={<Trans>Save</Trans>}
                                        onCancel={() => setEditing(false)}
                                        onSubmit={async body => {
                                            await actions.edit(row().id, body);
                                            setEditing(false);
                                        }}
                                    />
                                }
                            >
                                <Markdown source={row().body}/>
                            </Show>

                            <Show when={!editing() && row().editedAt}>
                                {at => <div><VersionBadge edited tag={row().editedVersionTag} at={at()}/></div>}
                            </Show>

                            <Show when={!editing()}>
                                <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                    <Show
                                        when={confirming()}
                                        fallback={
                                            <>
                                                <Show when={canEdit(row())}>
                                                    <ToolbarButton icon={IconEdit} label={_(msg`Edit`)} onClick={() => setEditing(true)}/>
                                                </Show>
                                                <Show when={row().depth < MAX_COMMENT_DEPTH}>
                                                    <ToolbarButton icon={IconReply} label={_(msg`Reply`)} onClick={() => setReplying(open => !open)}/>
                                                </Show>
                                                <span class="w-3"/>
                                                <Show when={canSetOutdated(row()) || canReportOutdated(row())}>
                                                    <ToolbarButton
                                                        icon={IconOutdated}
                                                        label={outdatedLabel(row())}
                                                        onClick={() => setConfirming(row().outdatedAt !== undefined ? "clearOutdated" : canSetOutdated(row()) ? "outdated" : "reportOutdated")}
                                                    />
                                                </Show>
                                                <Show when={isLoggedIn() && !isOwn(row()) && row().status === CommentStatus.Visible}>
                                                    <ToolbarButton icon={IconReport} label={_(msg`Report`)} onClick={() => setReporting(true)}/>
                                                </Show>
                                                <Show when={canDelete(row())}>
                                                    <ToolbarButton icon={IconDelete} label={_(msg`Delete`)} onClick={() => setConfirming("delete")}/>
                                                </Show>
                                                <Show when={isModerator() ? statusToggle(row()) : undefined}>
                                                    {move => (
                                                        <ToolbarButton
                                                            icon={statusLook(move().label).icon}
                                                            label={statusLook(move().label).text}
                                                            onClick={() => void act(() => moderation.setStatus(row().id, move().status))}
                                                        />
                                                    )}
                                                </Show>
                                                <Show when={isModerator() && row().editedAt}>
                                                    <ToolbarButton icon={IconHistory} label={_(msg`History`)} active={showHistory()} onClick={() => setShowHistory(open => !open)}/>
                                                </Show>
                                                <Show when={devMenusEnabled()}>
                                                    <Show when={!markdownCopied()} fallback={<ToolbarButton icon={IconCopied} label={_(msg`Copied!`)} onClick={() => {}}/>}>
                                                        <ToolbarButton icon={IconCopy} label={_(msg`Copy`)} onClick={copyMarkdown}/>
                                                    </Show>
                                                </Show>
                                            </>
                                        }
                                    >
                                        {kind => (
                                            <>
                                                <span>{confirmPrompt(kind())}</span>
                                                <Button
                                                    variant={kind() === "delete" ? "destructive" : "default"}
                                                    size="sm"
                                                    class="h-7 px-2"
                                                    onClick={() => void confirmed(row(), kind())}
                                                >
                                                    <Trans>Confirm</Trans>
                                                </Button>
                                                <Button variant="ghost" size="sm" class="h-7 px-2" onClick={() => setConfirming(undefined)}><Trans>Cancel</Trans></Button>
                                            </>
                                        )}
                                    </Show>
                                    <Show when={childIds().length > 0}>
                                        <Button variant="ghost" size="sm" class="h-7 px-2" onClick={() => setCollapsed(c => !c)}>
                                            <Show when={collapsed()} fallback={<Trans>Hide replies</Trans>}>
                                                <Plural value={childIds().length} one="Show # reply" other="Show # replies"/>
                                            </Show>
                                        </Button>
                                    </Show>
                                </div>
                            </Show>

                            <Show when={isModerator() && showHistory()}>
                                <RevisionHistory commentId={row().id} current={row().body} createdAt={row().createdAt}/>
                            </Show>

                            <Show when={error()}>
                                <p class="text-sm text-destructive">{error()}</p>
                            </Show>

                            <ReportDialog commentId={row().id} open={reporting()} onClose={() => setReporting(false)} actions={moderation}/>

                            <Show when={replying()}>
                                <div class="ml-6 border-l pl-3">
                                    <CommentComposer
                                        autofocus
                                        submitLabel={<Trans>Reply</Trans>}
                                        onCancel={() => setReplying(false)}
                                        onSubmit={async body => {
                                            await actions.post(pageKey(), row().id, body);
                                            setReplying(false);
                                        }}
                                    />
                                </div>
                            </Show>
                        </div>
                    </div>
                )}
            </Show>

            <Show when={childIds().length > 0 && !collapsed()}>
                <div class="ml-6 flex flex-col gap-3">
                    <For each={childIds()}>{id => <CommentItem id={id} nested/>}</For>
                </div>
            </Show>
        </div>
    );
}
