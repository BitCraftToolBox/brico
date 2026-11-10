import {parseVersionStamp} from "@brico/crafts/comments";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {TbOutlineInfoTriangle as IconOutdated} from "solid-icons/tb";
import {Show} from "solid-js";
import type {Timestamp} from "spacetimedb";
import {CommentTime} from "~/components/comments/CommentTime";
import {uiLocale} from "~/lib/i18n";
import {cn} from "~/lib/utils";

/**
 * "1.46 · 1 hour ago": the release a comment was written or edited on, and when. The data tag is
 * the version's tooltip. A differing version is not a sign the comment is outdated, so this stays
 * neutral unless `outdated` (the moderator or reader flag) turns it into a warning. `href` turns
 * the time into a link.
 */
export function VersionBadge(props: {
    tag: string | undefined;
    at: Timestamp;
    href?: string;
    edited?: boolean;
    outdated?: {at: Timestamp; tag: string | undefined};
}) {
    const {_} = useLingui();
    const stamp = () => props.tag === undefined ? undefined : parseVersionStamp(props.tag);
    const outdatedTitle = () => {
        const flagged = props.outdated;
        if (!flagged) return undefined;
        const date = flagged.at.toDate().toLocaleDateString(uiLocale());
        const version = flagged.tag === undefined ? date : `${date} · ${parseVersionStamp(flagged.tag).version}`;
        return _(msg`This comment may be outdated (flagged ${version})`);
    };
    return (
        <span
            class={cn(
                "inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                props.outdated ? "bg-warning text-warning-foreground" : "bg-muted",
                props.edited && "italic",
            )}
            title={outdatedTitle()}
        >
            <Show when={props.outdated}><IconOutdated class="size-3 shrink-0 self-center"/></Show>
            <Show when={props.edited}><Trans>edited</Trans></Show>
            <Show when={stamp()}>
                {s => <><span title={props.outdated ? undefined : s().tag}>{s().version}</span><span aria-hidden="true">·</span></>}
            </Show>
            <Show when={props.href} fallback={<CommentTime at={props.at}/>}>
                {href => <A href={href()} class="hover:underline"><CommentTime at={props.at}/></A>}
            </Show>
        </span>
    );
}
