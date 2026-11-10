/**
 * CommentComposer.tsx — the textarea, Markdown toolbar and preview used for new comments, replies
 * and edits. A logged-out visitor gets a login prompt instead.
 */
import {commentPageKey, isValidCommentPageKey, MAX_COMMENT_LENGTH} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {type IconTypes} from "solid-icons";
import {
    TbOutlineBold as IconBold,
    TbOutlineCode as IconCode,
    TbOutlineItalic as IconItalic,
    TbOutlineLink as IconLink,
    TbOutlineList as IconList,
    TbOutlineListNumbers as IconNumbered,
    TbOutlineQuote as IconQuote,
    TbOutlineStrikethrough as IconStrike,
} from "solid-icons/tb";
import {createMemo, createSignal, For, type JSX, Show} from "solid-js";
import {Markdown} from "~/components/comments/Markdown";
import GlobalSearchInput from "~/components/GlobalSearchInput";
import BricoFace from "~/components/ui/brico-face";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {TextField, TextFieldTextArea} from "~/components/ui/text-field";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {useLinkedIntegrations} from "~/lib/account/links";
import {useAccount} from "~/lib/account/state";
import {previewAuthorName} from "~/lib/comments/author";
import {applyFormat, type FormatKind, insertText} from "~/lib/comments/format";
import {gameLinkSource} from "~/lib/comments/markdown";
import {describeServerError} from "~/lib/crafts/error-vocab";
import type {ObjectMatch} from "~/lib/global-search";
import {cn} from "~/lib/utils";

const COUNTER_THRESHOLD = 0.8;

export function CommentComposer(props: {
    submitLabel: JSX.Element;
    onSubmit: (body: string) => Promise<void>;
    onCancel?: () => void;
    initialBody?: string;
    placeholder?: string;
    autofocus?: boolean;
    /** Editing someone else's comment: the editor's own display name is neither required nor shown. */
    moderating?: boolean;
}) {
    const {_} = useLingui();
    const {isLoggedIn, account, login} = useAccount();
    const {links} = useLinkedIntegrations();

    const [body, setBody] = createSignal(props.initialBody ?? "");
    const [preview, setPreview] = createSignal(false);
    const [linksOpen, setLinksOpen] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    // The textarea stays mounted (hidden) while previewing, so its size and scroll survive; the
    // selection is restored by hand and the preview takes the textarea's height.
    const [previewHeight, setPreviewHeight] = createSignal<number>();
    let textarea: HTMLTextAreaElement | undefined;
    let selection: [number, number] = [0, 0];

    function showPreview(on: boolean) {
        if (on === preview()) return;
        if (on && textarea) {
            selection = [textarea.selectionStart, textarea.selectionEnd];
            setPreviewHeight(textarea.offsetHeight);
        }
        setPreview(on);
        if (!on && textarea) {
            const el = textarea;
            el.focus();
            el.setSelectionRange(...selection);
        }
    }

    const authorName = createMemo(() => previewAuthorName(account()?.displayName, links()));
    const length = () => [...body()].length;
    const canSubmit = () => !busy() && body().trim() !== "" && length() <= MAX_COMMENT_LENGTH && (props.moderating || authorName() !== undefined);

    function format(kind: FormatKind) {
        if (!textarea) return;
        const edit = applyFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind);
        setBody(edit.text);
        textarea.value = edit.text;
        textarea.focus();
        textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    }

    /**
     * Inserts a `[[kind:id]]` link to the picked database page at the textarea's caret. With `keepOpen`
     * the popover keeps focus for the next pick, and a space follows the link so picks don't run together.
     */
    function insertGameLink(match: ObjectMatch, keepOpen: boolean) {
        if (!keepOpen) setLinksOpen(false);
        const [kind, id] = match.route.replace(/^\/database\//, "").split("/");
        const pageKey = commentPageKey(kind, id);
        if (!textarea || !isValidCommentPageKey(pageKey)) return;
        const source = gameLinkSource(pageKey) + (keepOpen ? " " : "");
        const edit = insertText(textarea.value, textarea.selectionStart, textarea.selectionEnd, source);
        setBody(edit.text);
        textarea.value = edit.text;
        if (!keepOpen) textarea.focus();
        textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    }

    async function submit() {
        if (!canSubmit()) return;
        setBusy(true);
        setError(null);
        try {
            await props.onSubmit(body());
            setBody("");
            showPreview(false);
        } catch (e) {
            setError(describeServerError(e));
        } finally {
            setBusy(false);
        }
    }

    const tools = (): [FormatKind, IconTypes, string][] => [
        ["bold", IconBold, _(msg`Bold`)],
        ["italic", IconItalic, _(msg`Italic`)],
        ["strike", IconStrike, _(msg`Strikethrough`)],
        ["code", IconCode, _(msg`Code`)],
        ["quote", IconQuote, _(msg`Quote`)],
        ["list", IconList, _(msg`Bulleted list`)],
        ["numbered", IconNumbered, _(msg`Numbered list`)],
        ["link", IconLink, _(msg`Link`)],
    ];

    return (
        <Show
            when={isLoggedIn()}
            fallback={
                <div class="flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm">
                    <span class="text-muted-foreground"><Trans>Log in to join the discussion.</Trans></span>
                    <Button size="sm" onClick={() => void login()}><Trans>Log in</Trans></Button>
                </div>
            }
        >
            <div class="flex flex-col gap-2 border-t pt-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="inline-flex rounded-md bg-muted p-0.5 text-xs">
                        <button type="button" class={cn("rounded px-2 py-1", !preview() && "bg-background shadow-sm")} onClick={() => showPreview(false)}><Trans>Write</Trans></button>
                        <button type="button" class={cn("rounded px-2 py-1", preview() && "bg-background shadow-sm")} onClick={() => showPreview(true)}><Trans>Preview</Trans></button>
                    </div>
                    <Show when={!preview()}>
                        <div class="flex gap-0.5">
                            <Popover open={linksOpen()} onOpenChange={setLinksOpen}>
                                <PopoverTrigger as={Button} type="button" variant="ghost" size="icon" class="size-8" aria-label={_(msg`Links`)} title={_(msg`Links`)}>
                                    <BricoFace class="size-4"/>
                                </PopoverTrigger>
                                <PopoverContent class="w-80 p-2">
                                    <GlobalSearchInput autofocus placeholder={_(msg`Search for a page to link…`)} onSelect={insertGameLink}/>
                                </PopoverContent>
                            </Popover>
                            <For each={tools()}>{([kind, Icon, label]) => (
                                <Tooltip>
                                    <TooltipTrigger as={Button} type="button" variant="ghost" size="icon" class="size-8" aria-label={label} onClick={() => format(kind)}>
                                        <Icon class="size-4"/>
                                    </TooltipTrigger>
                                    <TooltipContent>{label}</TooltipContent>
                                </Tooltip>
                            )}</For>
                        </div>
                    </Show>
                </div>

                <Show when={preview()}>
                    <div class="min-h-[80px] rounded-md border px-3 py-2" style={{"min-height": previewHeight() ? `${previewHeight()}px` : undefined}}>
                        <Show when={body().trim()} fallback={<span class="text-sm text-muted-foreground"><Trans>Nothing to preview.</Trans></span>}>
                            <Markdown source={body()}/>
                        </Show>
                    </div>
                </Show>
                <TextField value={body()} onChange={setBody} style={{display: preview() ? "none" : undefined}}>
                    <TextFieldTextArea
                        ref={el => {
                            textarea = el;
                            if (props.autofocus) queueMicrotask(() => el.focus());
                        }}
                        rows={4}
                        placeholder={props.placeholder}
                        onKeyDown={e => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                void submit();
                            }
                        }}
                    />
                </TextField>

                <Show when={error()}>
                    <p class="text-sm text-destructive">{error()}</p>
                </Show>

                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-xs text-muted-foreground">
                        <Show when={!props.moderating}>
                            <Show
                                when={authorName()}
                                fallback={<Trans>Set a display name or link an account in your <A href="/account/profile" class="underline">profile</A> to post.</Trans>}
                            >
                                {name => <Trans>Posting as {name()}</Trans>}
                            </Show>
                        </Show>
                        <Show when={length() >= MAX_COMMENT_LENGTH * COUNTER_THRESHOLD}>
                            <span class={cn("ml-2 tabular-nums", length() > MAX_COMMENT_LENGTH && "text-destructive")}>{length()}/{MAX_COMMENT_LENGTH}</span>
                        </Show>
                    </span>
                    <div class="flex gap-2">
                        <Show when={props.onCancel}>
                            <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}><Trans>Cancel</Trans></Button>
                        </Show>
                        <Button type="button" size="sm" disabled={!canSubmit()} onClick={() => void submit()}>{props.submitLabel}</Button>
                    </div>
                </div>
            </div>
        </Show>
    );
}
