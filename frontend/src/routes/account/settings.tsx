/**
 * settings.tsx — `/account/settings`, the "Settings" tab of the account pages.
 *
 * Unlike the other two account tabs (`/account/profile`, `/account/notifications`), this page
 * isn't gated behind a login: it collects settings that are stored client-side regardless of
 * account (`~/lib/settings`), the same way the standalone `/settings` page is — a payer recording
 * payments still wants local groupings without necessarily being logged in yet, and the payout
 * display toggle here is a duplicate (not a move) of the one on `/settings`, for the same reason
 * that page keeps its own copy: it's usable with no account at all.
 *
 * `createPlayerNames` (no ids) resolves the full player table once, shared with `/account/payees`
 * — see that function's doc comment for why this doesn't narrow to a caller-specific id set.
 */
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import type {IconTypes} from "solid-icons";
import {TbOutlineCoin as IconCurrency, TbOutlineHammer as IconEffort} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {LocalGroupingsManager} from "~/components/crafts/LocalGroupingsManager";
import {PlayerOption} from "~/components/crafts/PlayerPicker.tsx";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {Label} from "~/components/ui/label";
import {showToast} from "~/components/ui/toast";
import {accountTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state.tsx";
import {createPlayerNames} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {compareText} from "~/lib/i18n.ts";
import {type PayoutDisplayMode, useSettings} from "~/lib/settings";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";

/** Same control as `routes/settings.tsx`'s `ButtonGroup` — copied, not shared, per this file's doc comment. */
function ButtonGroup<T extends string>(props: {
    options: {value: T; icon: IconTypes; label: string}[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div class="inline-flex flex-col sm:flex-row rounded-md border border-input overflow-hidden">
            <For each={props.options}>
                {(opt) => (
                    <button
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={props.value === opt.value}
                        class={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors
                            ${props.value === opt.value
                                ? "bg-primary text-primary-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }
                            not-last:border-r not-last:border-input`}
                        onClick={() => props.onChange(opt.value)}
                    >
                        {opt.icon({class: "size-4 shrink-0"})}
                        <span>{opt.label}</span>
                    </button>
                )}
            </For>
        </div>
    );
}

export default function AccountSettingsPage() {
    const settings = useSettings();
    const {_} = useLingui();
    const {isLoggedIn} = useAccount();
    const {names: playerNames} = createPlayerNames();
    const conn = useConnection(PRISM_SERVER);
    const playerOptions = createMemo<PlayerOption[]>(() =>
        [...playerNames().entries()]
            .map(([playerId, name]) => ({playerId, name}))
            .sort((a, b) => compareText(a.name, b.name))
    );

    const [testCounter, setTestCounter] = createSignal(0);
    const sendTestToast = (priority: "high" | "low") => {
        const current = testCounter();
        setTestCounter(current + 1);
        // dev facing, no i18n
        showToast({title: () => `Test Toast ${current}`, description: () => priority, priority});
    };

    return (
        <MainLayout title={_(msg`Settings`)} hideSearch ownHeading description="Account-level bounty and notification preferences." navTitle={breadcrumb("/account", msg`Settings`)}>
            <div class="max-w-2xl mx-auto flex flex-col gap-4 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Account</Trans>}
                    tabs={accountTabs()}
                    status={<ConnectionStatusBadge connections={[conn]}/>}
                />

                <Card>
                    <CardHeader>
                        <CardTitle class="text-base"><Trans>Payout display</Trans></CardTitle>
                        <CardDescription>
                            <Trans>How bounty rates are shown and entered — currency per effort, or effort per currency.</Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="flex justify-center">
                        <ButtonGroup<PayoutDisplayMode>
                            value={settings.payoutDisplayMode()}
                            onChange={settings.setPayoutDisplayMode}
                            options={[
                                {value: "currencyPerEffort", icon: IconCurrency, label: _(msg`Currency / effort`)},
                                {value: "effortPerCurrency", icon: IconEffort, label: _(msg`Effort / currency`)},
                            ]}
                        />
                    </CardContent>
                </Card>

                <Show when={!isLoggedIn()}>
                    <div class="text-center font-bold"><Trans>The following settings require you to be logged in to function.</Trans></div>
                </Show>

                <Card>
                    <CardHeader>
                        <CardTitle class="text-base"><Trans>Toast everywhere</Trans></CardTitle>
                        <CardDescription>
                            <Trans>
                                Show a toast for a new notification anywhere on the site. The craft browser page always notifies on watched filters, regardless of this setting.
                            </Trans>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div class="flex flex-row items-center gap-2">
                            <Checkbox checked={settings.notifyToastEverywhere()} onChange={settings.setNotifyToastEverywhere}/>
                            <Label><Trans>Enabled</Trans></Label>
                            <Show when={settings.devMenusEnabled()}>
                                <div class="flex flex-row gap-2 ml-auto">
                                    {/* dev-facing, no i18n */}
                                    <Button variant="ghost" onclick={() => sendTestToast("low")}>Test Toast (Low)</Button>
                                    <Button variant="ghost" onclick={() => sendTestToast("high")}>Test Toast (High)</Button>
                                </div>
                            </Show>
                        </div>
                    </CardContent>
                </Card>

                <LocalGroupingsManager
                    playerOptions={playerOptions()}
                    groupings={settings.localPayeeGroupings()}
                    onChange={settings.setLocalPayeeGroupings}
                />
            </div>
        </MainLayout>
    );
}
