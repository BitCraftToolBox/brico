import type {Comment} from "@brico/bindings/brico-app/types";
import {CommentStatus} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {type Change, diffWordsWithSpace} from "diff";
import type {IconTypes} from "solid-icons";
import {
    TbOutlineCheck as IconApprove,
    TbOutlineClock as IconOutdated,
    TbOutlineEye as IconRestore,
    TbOutlineEyeClosed as IconHide,
    TbOutlineHistory as IconHistory,
} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import type {Timestamp} from "spacetimedb";
import {CommentTime} from "~/components/comments/CommentTime";
import {Markdown} from "~/components/comments/Markdown";
import {ToolbarButton} from "~/components/comments/ToolbarButton";
import {createCommentRevisions, type ModerationActions} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {cn} from "~/lib/utils";

/** The move a moderator can make from a comment's current status; `undefined` for author-deleted comments. */
export function statusToggle(row: Comment): {label: "hide" | "restore" | "approve"; status: number} | undefined {
    switch (row.status) {
        case CommentStatus.Visible: return {label: "hide", status: CommentStatus.Hidden};
        case CommentStatus.Hidden: return {label: "restore", status: CommentStatus.Visible};
        case CommentStatus.Pending: return {label: "approve", status: CommentStatus.Visible};
        default: return undefined;
    }
}

/** The icon and tooltip text for a `statusToggle` move. */
export function useStatusToggleLook(): (label: "hide" | "restore" | "approve") => {icon: IconTypes; text: string} {
    const {_} = useLingui();
    return label => {
        switch (label) {
            case "hide": return {icon: IconHide, text: _(msg`Hide`)};
            case "restore": return {icon: IconRestore, text: _(msg`Restore`)};
            case "approve": return {icon: IconApprove, text: _(msg`Approve`)};
        }
    };
}

/** Inline word diff: additions green, removals struck through. */
function BodyDiff(props: {parts: Change[]}) {
    return (
        <p class="whitespace-pre-wrap wrap-break-word font-mono text-xs">
            <For each={props.parts}>
                {part => (
                    <span class={cn(part.added && "bg-success/60", part.removed && "bg-destructive/60 line-through")}>{part.value}</span>
                )}
            </For>
        </p>
    );
}

/** Word diffs of raw Markdown bodies, computed once per distinct (before, after) pair. */
function createDiffCache() {
    const cache = new Map<string, Map<string, Change[]>>();
    return (before: string, after: string) => {
        let byAfter = cache.get(before);
        if (!byAfter) cache.set(before, byAfter = new Map());
        let parts = byAfter.get(after);
        if (!parts) byAfter.set(after, parts = diffWordsWithSpace(before, after));
        return parts;
    };
}

/**
 * The versions of a comment, newest first: the live body, then each body an edit replaced, the
 * original last. Each shows when it came to be, as a diff from the version before it or as rendered Markdown.
 */
export function RevisionHistory(props: {commentId: bigint; current: string; createdAt: Timestamp}) {
    const {revisions, ready} = createCommentRevisions(props.commentId);
    const [mode, setMode] = createSignal<"diff" | "markdown">("diff");
    // Each view is built on first use and then only hidden, so switching modes doesn't rebuild it.
    const [visited, setVisited] = createSignal({diff: true, markdown: false});
    const select = (next: "diff" | "markdown") => {
        setMode(next);
        setVisited(seen => (seen[next] ? seen : {...seen, [next]: true}));
    };
    const diff = createDiffCache();
    const versions = createMemo(() => {
        const edits = revisions();
        return [props.current, ...edits.map(edit => edit.body)].map((body, i) => ({
            body,
            at: edits[i]?.editedAt ?? props.createdAt,
            diff: edits[i] ? diff(edits[i].body, body) : undefined,
            original: i === edits.length,
        }));
    });
    return (
        <div class="flex w-full flex-col gap-3 border-l pl-3 text-sm">
            <Show when={ready()} fallback={<p class="text-muted-foreground"><Trans>Loading…</Trans></p>}>
                <Show when={revisions().length > 0} fallback={<p class="text-muted-foreground"><Trans>Never edited.</Trans></p>}>
                    <div class="inline-flex self-start rounded-md bg-muted p-0.5 text-xs">
                        <button type="button" class={cn("rounded px-2 py-1", mode() === "diff" && "bg-background shadow-sm")} onClick={() => select("diff")}><Trans>Diff</Trans></button>
                        <button type="button" class={cn("rounded px-2 py-1", mode() === "markdown" && "bg-background shadow-sm")} onClick={() => select("markdown")}><Trans>Markdown</Trans></button>
                    </div>
                    <For each={versions()}>
                        {version => (
                            <div class="flex flex-col gap-2">
                                <p class="text-xs text-muted-foreground">
                                    <CommentTime at={version.at}/>
                                    <Show when={version.original}> · <Trans>Original</Trans></Show>
                                </p>
                                <Show when={visited().diff}>
                                    <div class={cn(mode() !== "diff" && "hidden")}>
                                        <Show
                                            when={version.diff}
                                            fallback={<p class="whitespace-pre-wrap wrap-break-word font-mono text-xs">{version.body}</p>}
                                        >
                                            {parts => <BodyDiff parts={parts()}/>}
                                        </Show>
                                    </div>
                                </Show>
                                <Show when={visited().markdown}>
                                    <div class={cn(mode() !== "markdown" && "hidden")}><Markdown source={version.body}/></div>
                                </Show>
                            </div>
                        )}
                    </For>
                </Show>
            </Show>
        </div>
    );
}

/** Moderate-in-place buttons for one comment on the admin lists: hide/restore/approve, outdated flag and edit history. */
export function ModeratorControls(props: {row: Comment; actions: ModerationActions; onError: (message: string | null) => void; onDone?: () => void}) {
    const {_} = useLingui();
    const [showHistory, setShowHistory] = createSignal(false);
    const toggle = () => statusToggle(props.row);
    const look = useStatusToggleLook();

    async function run(action: () => Promise<void>) {
        props.onError(null);
        try {
            await action();
            props.onDone?.();
        } catch (e) {
            props.onError(describeServerError(e));
        }
    }

    return (
        <>
            <Show when={toggle()}>
                {move => (
                    <ToolbarButton
                        icon={look(move().label).icon}
                        label={look(move().label).text}
                        onClick={() => void run(() => props.actions.setStatus(props.row.id, move().status))}
                    />
                )}
            </Show>
            <ToolbarButton
                icon={IconOutdated}
                label={props.row.outdatedAt !== undefined ? _(msg`Clear outdated`) : _(msg`Flag outdated`)}
                onClick={() => void run(() => props.actions.setOutdated(props.row.id, props.row.outdatedAt === undefined))}
            />
            <Show when={props.row.editedAt}>
                <ToolbarButton icon={IconHistory} label={_(msg`History`)} active={showHistory()} onClick={() => setShowHistory(open => !open)}/>
            </Show>
            <Show when={showHistory()}>
                <RevisionHistory commentId={props.row.id} current={props.row.body} createdAt={props.row.createdAt}/>
            </Show>
        </>
    );
}
