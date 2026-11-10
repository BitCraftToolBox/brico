/** Rendering of a `comment` (reply) notification, shared by its toast and the inbox row. */
import type {CommentNotificationPayload} from "@brico/crafts/notification";
import {Trans} from "@lingui/solid/macro";
import {Show} from "solid-js";
import {gameLinkFallback} from "~/lib/comments/markdown";
import {resolveGameLink} from "~/lib/comments/page-target";
import {IconLink, pageIcon} from "~/lib/game-links";

/** "<name> replied to your comment on <page>", the page linking to the reply. */
export function CommentReplyDetail(props: {value: CommentNotificationPayload}) {
    const senderName = () => props.value.senderName;
    const target = () => resolveGameLink(props.value.pageKey);
    return (
        <Show
            when={target()}
            fallback={<Trans>{senderName()} replied to your comment on {gameLinkFallback(props.value.pageKey)}</Trans>}
        >
            {t => (
                <Trans>
                    {senderName()} replied to your comment on{" "}
                    <IconLink href={`${t().href}?detail=comments#comment:${props.value.commentId}`} icon={pageIcon(t().title)}>{t().name}</IconLink>
                </Trans>
            )}
        </Show>
    );
}
