/** GameLink.tsx — a `[[kind:id]]` link in a comment, shown as the page's icon and name. */
import {Show} from "solid-js";
import {gameLinkFallback} from "~/lib/comments/markdown";
import {resolveGameLink} from "~/lib/comments/page-target";
import {IconLink, pageIcon} from "~/lib/game-links";

export function GameLink(props: {pageKey: string}) {
    const target = () => resolveGameLink(props.pageKey);
    return (
        <Show when={target()} fallback={<span>{gameLinkFallback(props.pageKey)}</span>}>
            {t => <IconLink href={t().href} icon={pageIcon(t().title)}>{t().name}</IconLink>}
        </Show>
    );
}
