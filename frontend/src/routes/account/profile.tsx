/**
 * profile.tsx — `/account/profile`, the "Profile" tab of the account pages: display name, linked
 * accounts, and log out. See `~/lib/account/route-tabs.tsx`'s `accountTabs` for the other two tabs
 * (`/account/notifications`, `/account/settings`).
 */
import type {LinkedIntegration} from "@brico/bindings/brico-app/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A, useSearchParams} from "@solidjs/router";
import type {JSX} from "solid-js";
import {createEffect, createSignal, For, onMount, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {TextField, TextFieldErrorMessage, TextFieldInput, TextFieldLabel} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip.tsx";
import {bitAuthLoginUrl, discordLoginUrl} from "~/lib/account/brico-bot";
import {useLinkedIntegrations} from "~/lib/account/links";
import {accountTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {breadcrumb} from "~/lib/game-links";
import {uiLocale} from "~/lib/i18n";
import {useSettings} from "~/lib/settings.tsx";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const BITCRAFT_PROVIDER = "bitcraft-ea2";
const DISCORD_PROVIDER = "discord";

/**
 * One row in the "Linked accounts" card — link/unlink for a single provider.
 */
function IntegrationRow(props: {
    label: JSX.Element;
    link: LinkedIntegration | null;
    linkLabel: JSX.Element;
    busy: boolean;
    onLink: () => void;
    onUnlink: (id: bigint) => void;
}) {
    return (
        <div class="flex items-center justify-between gap-3 rounded-md border p-3">
            <div class="min-w-0">
                <p class="text-sm font-medium">{props.label}</p>
                <Show
                    when={props.link}
                    fallback={<p class="text-sm text-muted-foreground"><Trans>Not linked.</Trans></p>}
                >
                    {link => (
                        <p class="text-sm text-muted-foreground truncate">
                            {link().externalHandle ?? link().externalId}
                            {" · "}
                            <Trans>linked {new Date(Number(link().linkedAt.toMillis())).toLocaleDateString(uiLocale())}</Trans>
                        </p>
                    )}
                </Show>
            </div>
            <Show
                when={props.link}
                fallback={<Button size="sm" disabled={props.busy} onClick={props.onLink}>{props.linkLabel}</Button>}
            >
                {link => (
                    <Button variant="outline" size="sm" disabled={props.busy} onClick={() => props.onUnlink(link().id)}>
                        <Trans>Unlink</Trans>
                    </Button>
                )}
            </Show>
        </div>
    );
}

/**
 * BitCraft-specific: unlike Discord, alts are expected, so this lists every active link with its
 * own unlink action, plus an always-available "link another" button, rather than the single
 * link/unlink toggle `IntegrationRow` uses for providers meant to stay at one.
 */
function BitCraftLinksRow(props: {
    links: LinkedIntegration[];
    linkLabel: JSX.Element;
    busy: boolean;
    onLink: () => void;
    onUnlink: (id: bigint) => void;
}) {
    return (
        <div class="flex flex-col gap-2 rounded-md border p-3">
            <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium"><Trans>BitCraft characters</Trans></p>
                <Button size="sm" disabled={props.busy} onClick={props.onLink}>{props.linkLabel}</Button>
            </div>
            <Show
                when={props.links.length > 0}
                fallback={<p class="text-sm text-muted-foreground"><Trans>Not linked.</Trans></p>}
            >
                <ul class="flex flex-col gap-1">
                    <For each={props.links}>
                        {link => (
                            <li class="flex items-center justify-between gap-3">
                                <p class="text-sm text-muted-foreground truncate">
                                    {link.externalHandle ?? link.externalId}
                                    {" · "}
                                    <Trans>linked {new Date(Number(link.linkedAt.toMillis())).toLocaleDateString(uiLocale())}</Trans>
                                </p>
                                <Button variant="outline" size="sm" disabled={props.busy} onClick={() => props.onUnlink(link.id)}>
                                    <Trans>Unlink</Trans>
                                </Button>
                            </li>
                        )}
                    </For>
                </ul>
            </Show>
        </div>
    );
}

export default function ProfilePage() {
    const {_} = useLingui();
    const {devMenusEnabled} = useSettings();
    const {isLoggedIn, account, login, logout, setDisplayName, loginMethod} = useAccount();
    const {links, beginLink, linkDiscordShortcut, unlink} = useLinkedIntegrations();
    const [searchParams, setSearchParams] = useSearchParams();
    const conn = useConnection(BRICO_APP_SERVER);

    // Local draft, committed on submit rather than per keystroke.
    const [draft, setDraft] = createSignal("");
    createEffect(() => setDraft(account()?.displayName ?? ""));
    const [error, setError] = createSignal("");

    const [busyProvider, setBusyProvider] = createSignal<string | null>(null);
    const [unlinkTarget, setUnlinkTarget] = createSignal<{id: bigint; label: string} | null>(null);

    // `brico-bot` appends `?linked=<provider>`/`?linkError=<message>` to its redirect back here
    // once a browser-initiated link (BitAuth, Discord's OAuth handshake) resolves — see
    // `lib/account/links.tsx`. The actual new `linked_integration` row arrives separately, as an
    // ordinary subscription update.
    onMount(() => {
        const linked = searchParams.linked;
        const linkError = searchParams.linkError;
        if (typeof linked === "string") {
            showToast({title: () => <Trans>Account linked</Trans>, variant: "success"});
            setSearchParams({linked: undefined, linkError: undefined}, {replace: true});
        } else if (typeof linkError === "string") {
            showToast({title: () => <Trans>Linking failed</Trans>, description: () => linkError, variant: "error"});
            setSearchParams({linked: undefined, linkError: undefined}, {replace: true});
        }
    });

    function bitcraftLinks() {
        return links().filter(l => l.provider === BITCRAFT_PROVIDER);
    }
    function discordLink() {
        return links().find(l => l.provider === DISCORD_PROVIDER) ?? null;
    }

    function reportError(e: unknown) {
        console.error(e);
        showToast({
            title: () => <Trans>Something went wrong</Trans>,
            description: () => describeServerError(e),
            variant: "error",
        });
    }

    async function linkBitCraft() {
        setBusyProvider(BITCRAFT_PROVIDER);
        try {
            const code = await beginLink(BITCRAFT_PROVIDER);
            window.location.href = bitAuthLoginUrl(code);
        } catch (e) {
            reportError(e);
            setBusyProvider(null);
        }
    }

    async function linkDiscord() {
        setBusyProvider(DISCORD_PROVIDER);
        try {
            if (loginMethod() === "discord") {
                await linkDiscordShortcut();
                setBusyProvider(null);
            } else {
                const code = await beginLink(DISCORD_PROVIDER);
                window.location.href = discordLoginUrl(code);
            }
        } catch (e) {
            reportError(e);
            setBusyProvider(null);
        }
    }

    async function confirmUnlink() {
        const target = unlinkTarget();
        if (!target) return;
        setUnlinkTarget(null);
        setBusyProvider(target.label);
        try {
            await unlink(target.id);
        } catch (e) {
            reportError(e);
        } finally {
            setBusyProvider(null);
        }
    }

    return (
        <MainLayout title={_(msg`Profile`)} hideSearch ownHeading description="Manage your Brico's Toolbox account." navTitle={breadcrumb("/account", msg`Profile`)}>
            <div class="max-w-2xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Account</Trans>}
                    tabs={accountTabs()}
                    status={<ConnectionStatusBadge connections={[conn]}/>}
                />

                <Show
                    when={isLoggedIn()}
                    fallback={
                        <Card>
                            <CardHeader>
                                <CardTitle><Trans>You're not logged in</Trans></CardTitle>
                                <CardDescription>
                                    <Trans>Log in to sync saved filters and watches to your account, and to set up notifications.</Trans>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => void login()}><Trans>Log in</Trans></Button>
                            </CardContent>
                        </Card>
                    }
                >
                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Display name</Trans></CardTitle>
                            <CardDescription><Trans>Shown to other players wherever your account is credited.</Trans></CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                class="flex flex-row gap-2 items-end"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    setDisplayName(draft()).then(_ => setError("")).catch(e => { console.log(String(e.message)); setError(String(e.message))});
                                }}
                            >
                                <TextField class="flex-1" validationState={error() ? "invalid" : "valid"}>
                                    <TextFieldLabel class="sr-only"><Trans>Display name</Trans></TextFieldLabel>
                                    <Tooltip open={Boolean(error())}>
                                        <TooltipTrigger>
                                            <TextFieldInput value={draft()} onInput={(e) => setDraft(e.currentTarget.value)}/>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <TextFieldErrorMessage>{describeServerError(error())}</TextFieldErrorMessage>
                                        </TooltipContent>
                                    </Tooltip>
                                </TextField>
                                <Button type="submit"><Trans>Save</Trans></Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle><Trans>Linked accounts</Trans></CardTitle>
                            <CardDescription>
                                <Trans>
                                    Link your BitCraft account to get credit for crafts and contributions.
                                </Trans>
                                {/*
                                <br/>
                                <Trans>
                                    Link Discord to use slash commands and receive notifications there.
                                </Trans>
                                */}
                            </CardDescription>
                        </CardHeader>
                        <CardContent class="flex flex-col gap-2">
                            <BitCraftLinksRow
                                links={bitcraftLinks()}
                                linkLabel={bitcraftLinks().length > 0 ? <Trans>Link another</Trans> : <Trans>Link via BitAuth</Trans>}
                                busy={busyProvider() === BITCRAFT_PROVIDER}
                                onLink={linkBitCraft}
                                onUnlink={(id) => setUnlinkTarget({id, label: BITCRAFT_PROVIDER})}
                            />
                            {/* hide this until it's fully implemented */}
                            <Show when={devMenusEnabled()}>
                                <IntegrationRow
                                    label={<Trans>Discord</Trans>}
                                    link={discordLink()}
                                    linkLabel={loginMethod() === "discord" ? <Trans>Link Discord</Trans> : <Trans>Link via Discord</Trans>}
                                    busy={busyProvider() === DISCORD_PROVIDER}
                                    onLink={linkDiscord}
                                    onUnlink={(id) => setUnlinkTarget({id, label: DISCORD_PROVIDER})}
                                />
                            </Show>
                        </CardContent>
                    </Card>

                    <div class="flex flex-row justify-between">
                        <Button variant="outline" as={A} href={"/account/bounties"}>
                            <Trans>Bounties</Trans>
                        </Button>
                        <Button variant="outline" onClick={() => void logout()}>
                            <Trans>Log out</Trans>
                        </Button>
                    </div>
                </Show>
            </div>

            <Dialog open={unlinkTarget() !== null} onOpenChange={open => { if (!open) setUnlinkTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle><Trans>Unlink this account?</Trans></DialogTitle>
                        <DialogDescription>
                            <Trans>You can link it again later.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUnlinkTarget(null)}><Trans>Cancel</Trans></Button>
                        <Button variant="destructive" onClick={confirmUnlink}><Trans>Unlink</Trans></Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
