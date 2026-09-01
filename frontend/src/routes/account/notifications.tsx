/**
 * notifications.tsx — `/account/notifications`, the inbox behind the sidebar's unread badge.
 *
 * Styled like `routes/account/profile.tsx` (`MainLayout` + `Card`s). Rendering switches on
 * `payload.tag` (only `'craft'` today) — the seam a future watchable type's notification slots
 * into without touching this page's layout.
 *
 * The "toast everywhere" setting used to live on this page; it's on `/account/settings` now — see
 * that page's doc comment for why (this page needs a login, that one doesn't).
 */
import type {Notification} from "@brico/bindings/brico-app/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Badge} from "~/components/ui/badge";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {clearToasts} from "~/components/ui/toast.tsx";
import {accountTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {useNotifications} from "~/lib/notifications/state";
import {getCraftingRecipeName} from "~/lib/relations";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/** Same wording `browse.tsx`'s `TRIGGER_VERB` uses, for this inbox's own rendering. */
const EVENT_VERB = {
    added: msg`now matches`,
    finished: msg`finished crafting`,
    removed: msg`no longer matches`,
};

function recipeNameFor(recipeId: number): string {
    const recipe = BitCraftTables.CraftingRecipeDesc.indexedBy("id")().get(recipeId);
    return recipe ? getCraftingRecipeName(recipe) : `Recipe #${recipeId}`;
}

function NotificationRow(props: {notification: Notification; onMarkRead: () => void; onDelete: () => void}) {
    const {_} = useLingui();
    const unread = createMemo(() => props.notification.readAt === undefined);

    return (
        <div class={`flex items-start justify-between gap-3 rounded-md border p-3 ${unread() ? "bg-accent/40" : ""}`}>
            <div class="flex-1 space-y-1">
                <Show
                    when={props.notification.payload.tag === "Craft" ? props.notification.payload.value : null}
                    fallback={<p class="text-sm text-muted-foreground"><Trans>Unsupported notification.</Trans></p>}
                >
                    {value => (
                        <>
                            <p class="text-sm font-medium">{value().filterName}</p>
                            <p class="text-sm text-muted-foreground">
                                <A href={`/tools/crafts/${value().craftId}`} class="underline">{recipeNameFor(value().recipeId)}</A>
                                {" "}{EVENT_VERB[value().eventKind as keyof typeof EVENT_VERB] ? _(EVENT_VERB[value().eventKind as keyof typeof EVENT_VERB]) : value().eventKind}
                                {" · "}{value().regionName}
                                <Show when={value().claimName}>{claim => <>{" · "}{claim()}</>}</Show>
                                <Show when={value().ownerName}>{owner => <>{" · "}{owner()}</>}</Show>
                            </p>
                        </>
                    )}
                </Show>
                <p class="text-xs text-muted-foreground">
                    {new Date(Number(props.notification.createdAt.toMillis())).toLocaleString(uiLocale())}
                </p>
            </div>
            <div class="flex shrink-0 flex-row gap-1">
                <Show when={unread()}>
                    <Button variant="outline" size="sm" onClick={props.onMarkRead}><Trans>Mark read</Trans></Button>
                </Show>
                <Button variant="outline" size="sm" onClick={props.onDelete}><Trans>Delete</Trans></Button>
            </div>
        </div>
    );
}

export default function NotificationsPage() {
    const {_} = useLingui();
    const {isLoggedIn, login} = useAccount();
    const {notifications, unreadCount, markRead, markAllRead, remove} = useNotifications();
    const conn = useConnection(BRICO_APP_SERVER);

    const readIds = createMemo(() => notifications().filter(n => n.readAt !== undefined).map(n => n.id));
    const deleteRead = () => remove(readIds());

    return (
        <MainLayout title={_(msg`Notifications`)} hideSearch ownHeading description="Notifications from your watched craft filters." navTitle={breadcrumb("/account", msg`Notifications`)}>
            <div class="max-w-2xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Account</Trans>}
                    tabs={accountTabs()}
                    status={<ConnectionStatusBadge connections={[conn]}/>}
                />

                <div class="flex flex-wrap items-center gap-3">
                    <Show when={unreadCount() > 0}><Badge><Plural value={unreadCount()} one="# unread" other="# unread"/></Badge></Show>
                    <div class="ml-auto flex flex-row gap-2">
                        <Button
                            variant="outline" size="sm" disabled={unreadCount() === 0}
                            onClick={_ => {markAllRead(); clearToasts();}}
                        >
                            <Trans>Mark all read</Trans>
                        </Button>
                        <Button variant="outline" size="sm" disabled={readIds().length === 0} onClick={deleteRead}>
                            <Trans>Delete read</Trans>
                        </Button>
                    </div>
                </div>

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription>
                                    <Trans>Log in to see notifications from your watched craft filters.</Trans>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <div class="flex flex-col gap-2">
                        <Show
                            when={notifications().length > 0}
                            fallback={<p class="text-sm text-muted-foreground"><Trans>No notifications yet.</Trans></p>}
                        >
                            <For each={notifications()}>
                                {n => (
                                    <NotificationRow
                                        notification={n}
                                        onMarkRead={() => markRead(n.id)}
                                        onDelete={() => remove(n.id)}
                                    />
                                )}
                            </For>
                        </Show>
                    </div>
                </Show>
            </div>
        </MainLayout>
    );
}
