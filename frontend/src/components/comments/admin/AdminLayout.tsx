/** AdminLayout.tsx — shared frame for the moderation pages: tabs, connection status and the moderator gate. */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {Meta} from "@solidjs/meta";
import {type JSX, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader, {type RouteTab} from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {useAccount} from "~/lib/account/state";
import {createIsModerator} from "~/lib/comments/moderation";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

function adminCommentTabs(): RouteTab[] {
    return [
        {label: <Trans>Recent</Trans>, href: "/admin/comments"},
        {label: <Trans>Pending review</Trans>, href: "/admin/comments/pending"},
        {label: <Trans>Reports</Trans>, href: "/admin/comments/reports"},
        {label: <Trans>Commenter</Trans>, href: "/admin/comments/commenter"},
    ];
}

/** Renders `children` only for moderators. The module enforces access; this just hides empty pages. */
export function AdminLayout(props: {children: JSX.Element}) {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const isModerator = createIsModerator();
    const connection = useConnection(BRICO_APP_SERVER);

    return (
        <MainLayout title={_(msg`Comment moderation`)} hideSearch ownHeading>
            <Meta name="robots" content="noindex, nofollow"/>
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-6">
                <Show
                    when={isLoggedIn()}
                    fallback={<Button class="self-start" onClick={() => void login()}><Trans>Log in</Trans></Button>}
                >
                    <Show when={isModerator()} fallback={<p class="text-sm text-muted-foreground"><Trans>This page is for moderators.</Trans></p>}>
                        <RouteTabHeader title={<Trans>Comment moderation</Trans>} tabs={adminCommentTabs()} status={<ConnectionStatusBadge connections={[connection]}/>}/>
                        {props.children}
                    </Show>
                </Show>
            </div>
        </MainLayout>
    );
}
