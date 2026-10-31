/** `/admin/comments/commenter?identity=<hex>` — one account's restrictions, name and comment history. */
import type {AdminCommenter, Comment, CommentReport} from "@brico/bindings/brico-app/types";
import {MAX_MODERATION_REASON_LENGTH, PERMANENT_UNTIL_MICROS, ReportState} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useNavigate, useSearchParams} from "@solidjs/router";
import {createEffect, createMemo, createSignal, For, on, Show} from "solid-js";
import {Timestamp} from "spacetimedb";
import {parseIdentityParam} from "~/components/comments/admin/AdminCommentList";
import {AdminCommentRow} from "~/components/comments/admin/AdminCommentRow";
import {AdminLayout} from "~/components/comments/admin/AdminLayout";
import {CommentTime} from "~/components/comments/CommentTime";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {commenterHref, createModerationActions, type ModerationActions, REPORT_REASON_LABELS} from "~/lib/comments/moderation";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {uiLocale} from "~/lib/i18n";

const DAY_MS = 86_400_000;
const KEEP = "keep";
const NONE = "none";
const PERMANENT = "permanent";

type RestrictionKey = "postBlockedUntil" | "reviewRequiredUntil" | "nameLockedUntil" | "reportBlockedUntil";

const RESTRICTIONS: {key: RestrictionKey; label: ReturnType<typeof msg>}[] = [
    {key: "postBlockedUntil", label: msg`Posting and editing blocked`},
    {key: "reviewRequiredUntil", label: msg`New comments need review`},
    {key: "nameLockedUntil", label: msg`Display name locked`},
    {key: "reportBlockedUntil", label: msg`Reporting blocked`},
];

const DURATIONS: {value: string; days: number; label: ReturnType<typeof msg>}[] = [
    {value: "1", days: 1, label: msg`1 day`},
    {value: "7", days: 7, label: msg`7 days`},
    {value: "30", days: 30, label: msg`30 days`},
];

function isActive(until: Timestamp | undefined): until is Timestamp {
    return until !== undefined && until.toDate().getTime() > Date.now();
}

/** What the choice means as an end time: the current end for `keep`, `undefined` for none. */
function untilFor(choice: string, current: Timestamp | undefined): Timestamp | undefined {
    if (choice === KEEP) return isActive(current) ? current : undefined;
    if (choice === PERMANENT) return new Timestamp(PERMANENT_UNTIL_MICROS);
    const days = DURATIONS.find(d => d.value === choice)?.days;
    return days === undefined ? undefined : Timestamp.fromDate(new Date(Date.now() + days * DAY_MS));
}

function UntilLabel(props: {until: Timestamp}) {
    return (
        <Show when={props.until.microsSinceUnixEpoch < PERMANENT_UNTIL_MICROS} fallback={<Trans>permanent</Trans>}>
            <Trans>until {props.until.toDate().toLocaleString(uiLocale())}</Trans>
        </Show>
    );
}

function ReportStateBadge(props: {state: number}) {
    return (
        <Badge variant={props.state === ReportState.Open ? "default" : "outline"}>
            {props.state === ReportState.Dismissed ? <Trans>Dismissed</Trans> : props.state === ReportState.Actioned ? <Trans>Actioned</Trans> : <Trans>Open</Trans>}
        </Badge>
    );
}

function Reports(props: {title: string; reports: CommentReport[]; actions: ModerationActions}) {
    const {_} = useLingui();
    const [expanded, setExpanded] = createSignal(false);
    const [comments, setComments] = createSignal(new Map<bigint, Comment>());
    const [error, setError] = createSignal<string | null>(null);

    async function toggle() {
        if (expanded()) {
            setExpanded(false);
            return;
        }
        setError(null);
        try {
            const ids = [...new Set(props.reports.map(report => report.commentId))];
            const rows = await props.actions.getComments(ids);
            setComments(new Map(rows.map(row => [row.id, row])));
            setExpanded(true);
        } catch (e) {
            setError(describeServerError(e));
        }
    }

    const groups = createMemo(() => {
        const byComment = new Map<bigint, CommentReport[]>();
        for (const report of props.reports) byComment.set(report.commentId, [...(byComment.get(report.commentId) ?? []), report]);
        return [...byComment.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
    });

    return (
        <Show when={props.reports.length > 0}>
            <div class="flex flex-col gap-1">
                <h3 class="text-sm font-medium">
                    {props.title} · <button type="button" class="underline" onClick={() => void toggle()}>{expanded() ? <Trans>collapse</Trans> : <Trans>expand</Trans>}</button>
                </h3>
                <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
                <Show
                    when={expanded()}
                    fallback={
                        <ul class="flex flex-col gap-1 text-sm">
                            <For each={props.reports}>
                                {report => (
                                    <li class="flex flex-wrap items-baseline gap-2">
                                        <ReportStateBadge state={report.state}/>
                                        <Badge variant="secondary">{_(REPORT_REASON_LABELS[report.reason.tag])}</Badge>
                                        <span class="text-xs text-muted-foreground">#{report.commentId.toString()} · <A href={commenterHref(report.reporter)} class="underline"><Trans>Reporter</Trans></A> · <CommentTime at={report.createdAt}/></span>
                                        <Show when={report.note}>{note => <span>{note()}</span>}</Show>
                                    </li>
                                )}
                            </For>
                        </ul>
                    }
                >
                    <div class="flex flex-col gap-4">
                        <For each={groups()}>
                            {([id, group]) => (
                                <div class="flex flex-col gap-2">
                                    <Show when={comments().get(id)} fallback={<p class="text-sm italic text-muted-foreground"><Trans>Comment not found.</Trans></p>}>
                                        {comment => <AdminCommentRow initial={comment()} actions={props.actions}/>}
                                    </Show>
                                    <ul class="flex flex-col gap-1 pl-3 text-sm">
                                        <For each={group}>
                                            {report => (
                                                <li class="flex flex-wrap items-baseline gap-2">
                                                    <ReportStateBadge state={report.state}/>
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
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </div>
        </Show>
    );
}

function CommenterDetail(props: {commenter: AdminCommenter; onChanged: () => void}) {
    const {_} = useLingui();
    const actions = createModerationActions();
    const [choices, setChoices] = createSignal<Record<RestrictionKey, string>>({
        postBlockedUntil: isActive(props.commenter.permission?.postBlockedUntil) ? KEEP : NONE,
        reviewRequiredUntil: isActive(props.commenter.permission?.reviewRequiredUntil) ? KEEP : NONE,
        nameLockedUntil: isActive(props.commenter.permission?.nameLockedUntil) ? KEEP : NONE,
        reportBlockedUntil: isActive(props.commenter.permission?.reportBlockedUntil) ? KEEP : NONE,
    });
    const [reason, setReason] = createSignal(props.commenter.permission?.reason ?? "");
    const [name, setName] = createSignal("");
    const [error, setError] = createSignal<string | null>(null);

    async function run(action: () => Promise<void>, done: string) {
        setError(null);
        try {
            await action();
            showToast({title: () => done, variant: "success"});
            props.onChanged();
        } catch (e) {
            setError(describeServerError(e));
        }
    }

    const savePermissions = () => run(() => {
        const current = props.commenter.permission;
        const until = (key: RestrictionKey) => untilFor(choices()[key], current?.[key]);
        return actions.setPermissions({
            identity: props.commenter.identity,
            postBlockedUntil: until("postBlockedUntil"),
            reviewRequiredUntil: until("reviewRequiredUntil"),
            nameLockedUntil: until("nameLockedUntil"),
            reportBlockedUntil: until("reportBlockedUntil"),
            reason: reason().trim() || undefined,
        });
    }, _(msg`Restrictions saved`));

    return (
        <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold">{props.commenter.displayName ?? <Trans>No display name</Trans>}</h2>
                <p class="break-all text-xs text-muted-foreground">{props.commenter.identity.toHexString()}</p>
                <p class="text-xs text-muted-foreground"><Trans>Joined</Trans> <CommentTime at={props.commenter.createdAt}/></p>
                <Show when={props.commenter.isModerator}>
                    <Badge class="self-start"><Trans>Moderator</Trans></Badge>
                </Show>
            </div>

            <Show when={!props.commenter.isModerator}>
                <section class="flex flex-col gap-3">
                    <h3 class="text-sm font-medium"><Trans>Restrictions</Trans></h3>
                    <For each={RESTRICTIONS}>
                        {restriction => (
                            <label class="flex flex-wrap items-center gap-2 text-sm">
                                <span class="w-60">{_(restriction.label)}</span>
                                <select
                                    class="h-9 rounded-md border bg-background px-2"
                                    value={choices()[restriction.key]}
                                    onChange={e => setChoices(c => ({...c, [restriction.key]: e.currentTarget.value}))}
                                >
                                    <option value={NONE}>{_(msg`None`)}</option>
                                    <Show when={props.commenter.permission?.[restriction.key]}>
                                        {until => <Show when={isActive(until())}><option value={KEEP}>{_(msg`Keep current`)}</option></Show>}
                                    </Show>
                                    <For each={DURATIONS}>{d => <option value={d.value}>{_(d.label)}</option>}</For>
                                    <option value={PERMANENT}>{_(msg`Permanent`)}</option>
                                </select>
                                <Show when={props.commenter.permission?.[restriction.key]}>
                                    {until => <Show when={isActive(until())}><span class="text-xs text-muted-foreground"><UntilLabel until={until()}/></span></Show>}
                                </Show>
                            </label>
                        )}
                    </For>
                    <TextField value={reason()} onChange={setReason}>
                        <TextFieldInput class="h-9" maxLength={MAX_MODERATION_REASON_LENGTH} placeholder={_(msg`Reason (shown to moderators only)`)}/>
                    </TextField>
                    <Button class="self-start" onClick={() => void savePermissions()}><Trans>Save restrictions</Trans></Button>
                </section>

                <section class="flex flex-col gap-3">
                    <h3 class="text-sm font-medium"><Trans>Replace display name</Trans></h3>
                    <TextField value={name()} onChange={setName} class="max-w-xs">
                        <TextFieldInput class="h-9" placeholder={_(msg`New display name`)}/>
                    </TextField>
                    <Button
                        variant="outline" class="self-start" disabled={name().trim() === ""}
                        onClick={() => void run(() => actions.setDisplayName(props.commenter.identity, name()), _(msg`Name replaced`)).then(() => setName(""))}
                    >
                        <Trans>Replace name</Trans>
                    </Button>
                </section>

                <section>
                    <Button variant="destructive" onClick={() => void run(() => actions.hideAllBy(props.commenter.identity), _(msg`Comments hidden`))}>
                        <Trans>Hide all comments</Trans>
                    </Button>
                </section>
            </Show>

            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>

            <Reports title={_(msg`Reports against their comments`)} reports={props.commenter.reportsAgainst} actions={actions}/>
            <Reports title={_(msg`Reports they filed`)} reports={props.commenter.reportsBy} actions={actions}/>

            <section class="flex flex-col gap-3">
                <h3 class="text-sm font-medium"><Trans>Recent comments</Trans> · <A href={`/admin/comments?identity=${props.commenter.identity.toHexString()}`} class="underline"><Trans>see all</Trans></A></h3>
                <For each={props.commenter.comments}>{row => <AdminCommentRow initial={row} actions={actions}/>}</For>
            </section>
        </div>
    );
}

function CommenterLookup() {
    const {_} = useLingui();
    const actions = createModerationActions();
    const navigate = useNavigate();
    const [params] = useSearchParams<{identity?: string}>();
    const [input, setInput] = createSignal(params.identity ?? "");
    const [commenter, setCommenter] = createSignal<AdminCommenter>();
    const [error, setError] = createSignal<string | null>(null);

    const identity = () => parseIdentityParam(params.identity);
    async function load() {
        const id = identity();
        setError(null);
        if (id === undefined) {
            setCommenter(undefined);
            return;
        }
        try {
            setCommenter(await actions.getCommenter(id));
        } catch (e) {
            setCommenter(undefined);
            setError(describeServerError(e));
        }
    }
    createEffect(on(() => params.identity, () => void load()));

    return (
        <div class="flex flex-col gap-4">
            <form
                class="flex flex-wrap gap-2"
                onSubmit={e => {
                    e.preventDefault();
                    navigate(`/admin/comments/commenter?identity=${input().trim()}`);
                }}
            >
                <TextField value={input()} onChange={setInput} class="min-w-80 flex-1">
                    <TextFieldInput class="h-9" placeholder={_(msg`Account identity (64 hex characters)`)}/>
                </TextField>
                <Button type="submit"><Trans>Look up</Trans></Button>
            </form>
            <Show when={error()}><p class="text-sm text-destructive">{error()}</p></Show>
            <Show when={commenter()} keyed>{c => <CommenterDetail commenter={c} onChanged={() => void load()}/>}</Show>
        </div>
    );
}

export default function AdminCommenterPage() {
    return (
        <AdminLayout>
            <CommenterLookup/>
        </AdminLayout>
    );
}
