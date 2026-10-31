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
import type {DiscordNotifySink} from "@brico/bindings/brico-app/types";
import {DEFAULT_NOTIFY_TEMPLATE} from "@brico/crafts/discord-notify";
import {MAX_NOTIFY_TEMPLATE_LENGTH} from "@brico/crafts/errors";
import type {TriggerKind} from "@brico/crafts/watch";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineCoin as IconCurrency, TbOutlineHammer as IconEffort, TbOutlineRestore as IconRestore, TbOutlineSettings as IconSettings} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {CurrencyVisibilitySelect} from "~/components/crafts/CurrencyVisibilitySelect";
import {FundingAlertsCard} from "~/components/crafts/FundingAlertsCard";
import {LocalGroupingsManager} from "~/components/crafts/LocalGroupingsManager";
import {PlayerOption} from "~/components/crafts/PlayerPicker";
import MainLayout from "~/components/MainLayout";
import {ConnectionStatusBadge} from "~/components/shared/ConnectionStatusBadge";
import RouteTabHeader from "~/components/shared/RouteTabHeader";
import {ButtonGroup, SettingsCard, SettingsGroup, SettingsRow} from "~/components/shared/SettingsLayout";
import {Button} from "~/components/ui/button";
import {Checkbox} from "~/components/ui/checkbox";
import {Collapsible, CollapsibleContent} from "~/components/ui/collapsible";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "~/components/ui/dialog";
import {Switch, SwitchControl, SwitchThumb} from "~/components/ui/switch";
import {TextField, TextFieldInput, TextFieldLabel} from "~/components/ui/text-field";
import {showToast} from "~/components/ui/toast";
import {installDiscordBotUrl} from "~/lib/account/brico-bot";
import {accountTabs} from "~/lib/account/route-tabs";
import {useAccount} from "~/lib/account/state";
import {createCommentNotifySettings} from "~/lib/crafts/comment-notify-settings";
import {createDiscordNotifySettings, type DiscordNotifySettings, type DiscordNotifyTemplates} from "~/lib/crafts/discord-notify-settings";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {createPlayerNames} from "~/lib/crafts/relay";
import {breadcrumb} from "~/lib/game-links";
import {compareText} from "~/lib/i18n";
import {type CraftWatchTriggers, type PayoutDisplayMode, type SavedCraftFilter, useSettings} from "~/lib/settings";
import {useConnection} from "~/lib/spacetime/manager";
import {PRISM_SERVER} from "~/lib/spacetime/prism";
import {cn} from "~/lib/utils";

const NO_TRIGGERS: CraftWatchTriggers = {added: false, finished: false, removed: false};

/** The craft trigger events, shared by the checkbox grid and the per-sink wording panel. */
const EVENTS: {key: TriggerKind; label: MessageDescriptor; templateKey: keyof DiscordNotifyTemplates}[] = [
    {key: "added", label: msg`Match`, templateKey: "addedTemplate"},
    {key: "finished", label: msg`Finished`, templateKey: "finishedTemplate"},
    {key: "removed", label: msg`Removed`, templateKey: "removedTemplate"},
];

/** One saved filter's notification settings: a Toast checkbox, a checkbox per linked Discord sink, and an expandable per-sink wording/mention panel. */
function NotifySettingsFilterCard(props: {filter: SavedCraftFilter; discord: DiscordNotifySettings; onRequestUnlinkSink: (sink: DiscordNotifySink) => void; unlinkSinkBusy: boolean}) {
    const {_} = useLingui();
    const {craftFilterWatches, setCraftFilterWatches} = useSettings();
    const {discordNotifySinks, discordMentionFor, discordTriggersFor, setDiscordTrigger, discordTemplatesFor, setDiscordTemplate} = props.discord;
    const [expandedSink, setExpandedSink] = createSignal<string | null>(null);

    const toastTriggers = () => craftFilterWatches()[props.filter.id] ?? NO_TRIGGERS;
    const setToastEvent = (key: TriggerKind, checked: boolean) => {
        const next = {...toastTriggers(), [key]: checked};
        const rest = {...craftFilterWatches()};
        if (next.added || next.finished || next.removed) rest[props.filter.id] = next; else delete rest[props.filter.id];
        setCraftFilterWatches(rest);
    };

    const setDiscordEvent = (sinkId: string, event: {key: TriggerKind; templateKey: keyof DiscordNotifyTemplates}, checked: boolean) => {
        const next = {...discordTriggersFor(props.filter.id, sinkId), [event.key]: checked};
        setDiscordTrigger(props.filter.id, sinkId, next);
        // Prefill the default wording when enabling an event that has none.
        if (checked && !discordTemplatesFor(props.filter.id, sinkId)[event.templateKey]) setTemplateField(sinkId, event, DEFAULT_NOTIFY_TEMPLATE[event.key]);
    };

    const setTemplateField = (sinkId: string, event: {key: TriggerKind; templateKey: keyof DiscordNotifyTemplates}, value: string) => {
        value = value.trim();
        const next = {...discordTemplatesFor(props.filter.id, sinkId), [event.templateKey]: value.length > 0 ? value : undefined};
        setDiscordTemplate(props.filter.id, sinkId, next);
        // An empty template can't fire, so turn the event off.
        if (value.length === 0) setDiscordEvent(sinkId, event, false);
    };

    return (
        <div class="rounded-md border p-3 flex flex-col">
            <p class="text-sm font-medium">{props.filter.name}</p>
            <div class="overflow-x-auto py-2">
                <div
                    class="grid items-center justify-items-center gap-x-4 gap-y-1.5"
                    style={{"grid-template-columns": `auto repeat(${1 + discordNotifySinks().length}, auto)`}}
                >
                    <span class="justify-self-start"/>
                    <span class="text-xs text-muted-foreground"><Trans>Toast</Trans></span>
                    <For each={discordNotifySinks()}>
                        {sink => <span class="text-xs text-muted-foreground truncate min-w-fit max-w-32" title={sink.channelName ?? sink.channelId}>{sink.channelName ?? sink.channelId}</span>}
                    </For>

                    <span class="justify-self-start text-xs text-muted-foreground"><Trans>Settings</Trans></span>
                    <span/>
                    <For each={discordNotifySinks()}>
                        {sink => (
                            <button
                                type="button"
                                aria-label={_(msg`Customize settings for ${sink.channelName ?? sink.channelId}`)}
                                aria-pressed={expandedSink() === sink.id}
                                title={_(msg`Customize settings for ${sink.channelName ?? sink.channelId}`)}
                                class={cn(
                                    "flex items-center justify-center rounded-sm p-1 transition-colors",
                                    expandedSink() === sink.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                )}
                                onClick={() => setExpandedSink(expandedSink() === sink.id ? null : sink.id)}
                            >
                                <IconSettings class="size-4"/>
                            </button>
                        )}
                    </For>

                    <For each={EVENTS}>
                        {event => (
                            <>
                                <span class="justify-self-start text-xs">{_(event.label)}</span>
                                <Checkbox checked={toastTriggers()[event.key]} onChange={(c: boolean) => setToastEvent(event.key, c)}/>
                                <For each={discordNotifySinks()}>
                                    {sink => <Checkbox checked={discordTriggersFor(props.filter.id, sink.id)[event.key]} onChange={(c: boolean) => setDiscordEvent(sink.id, event, c)}/>}
                                </For>
                            </>
                        )}
                    </For>
                </div>
            </div>
            <For each={discordNotifySinks()}>
                {sink => (
                    <Collapsible open={expandedSink() === sink.id}>
                        <CollapsibleContent class="flex flex-col gap-2 pt-2">
                            <p class="text-xs text-muted-foreground">
                                <Trans>Mention: {discordMentionFor(props.filter.id, sink.id)?.name ?? _(msg`(none)`)}</Trans>
                                {" — "}
                                <Trans>set via <code>/crafts notify-setup</code> in Discord.</Trans>
                            </p>
                            <For each={EVENTS}>
                                {event => (
                                    <TextField>
                                        <TextFieldLabel class="text-xs">{_(event.label)}</TextFieldLabel>
                                        <div class="flex items-center gap-1">
                                            <TextFieldInput
                                                value={discordTemplatesFor(props.filter.id, sink.id)[event.templateKey] ?? ""}
                                                maxLength={MAX_NOTIFY_TEMPLATE_LENGTH}
                                                onInput={(e: InputEvent & {currentTarget: HTMLInputElement}) => setTemplateField(sink.id, event, e.currentTarget.value)}
                                            />
                                            <button
                                                type="button"
                                                aria-label={_(msg`Reset to default wording`)}
                                                title={_(msg`Reset to default wording`)}
                                                class="shrink-0 rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                onClick={() => setTemplateField(sink.id, event, DEFAULT_NOTIFY_TEMPLATE[event.key])}
                                            >
                                                <IconRestore class="size-4"/>
                                            </button>
                                        </div>
                                    </TextField>
                                )}
                            </For>
                            <Button variant="outline" size="sm" class="self-start text-destructive" disabled={props.unlinkSinkBusy} onClick={() => props.onRequestUnlinkSink(sink)}>
                                <Trans>Unlink this channel</Trans>
                            </Button>
                        </CollapsibleContent>
                    </Collapsible>
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
    const discord = createDiscordNotifySettings();
    const commentNotify = createCommentNotifySettings();
    const conn = useConnection(PRISM_SERVER);
    const [unlinkSinkTarget, setUnlinkSinkTarget] = createSignal<DiscordNotifySink | null>(null);
    const [unlinkSinkBusy, setUnlinkSinkBusy] = createSignal(false);

    async function confirmUnlinkSink() {
        const target = unlinkSinkTarget();
        if (!target) return;
        setUnlinkSinkTarget(null);
        setUnlinkSinkBusy(true);
        try {
            await discord.unlinkDiscordSink(target.id);
        } catch (e) {
            console.error(e);
            showToast({title: () => <Trans>Something went wrong</Trans>, description: () => describeServerError(e), variant: "error"});
        } finally {
            setUnlinkSinkBusy(false);
        }
    }
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
            <div class="max-w-3xl mx-auto flex flex-col gap-6 px-4 pb-6">
                <RouteTabHeader
                    title={<Trans>Account</Trans>}
                    tabs={accountTabs()}
                    status={<ConnectionStatusBadge connections={[conn]}/>}
                />

                <SettingsGroup
                    title={<Trans>Notifications</Trans>}
                    description={
                        <Show when={!isLoggedIn()} fallback={<Trans>Where and when Brico.app notifies you.</Trans>}>
                            <Trans>Log in to be notified about comments and funding, and to add Discord notifications for craft watches.</Trans>
                        </Show>
                    }
                >
                    <Show when={isLoggedIn()}>
                        <SettingsCard title={<Trans>Comments</Trans>}>
                            <SettingsRow label={<Trans>Replies</Trans>} description={<Trans>Show a toast when someone replies to your comment.</Trans>}>
                                <Switch checked={commentNotify.replyToast()} onChange={commentNotify.setReplyToast}>
                                    <SwitchControl><SwitchThumb/></SwitchControl>
                                </Switch>
                            </SettingsRow>
                            <Show when={commentNotify.lastError()}>{error => <p class="text-sm text-destructive">{error()}</p>}</Show>
                        </SettingsCard>

                        <FundingAlertsCard/>
                    </Show>

                    <SettingsCard
                        title={<Trans>Craft watches</Trans>}
                        description={<Trans>Per saved filter, which targets notify on which events.</Trans>}
                    >
                        <SettingsRow
                            label={<Trans>Toast everywhere</Trans>}
                            description={<Trans>Show a toast for a watched craft anywhere on the site, not just on craft pages.</Trans>}
                        >
                            <Switch checked={settings.notifyToastEverywhere()} onChange={settings.setNotifyToastEverywhere}>
                                <SwitchControl><SwitchThumb/></SwitchControl>
                            </Switch>
                        </SettingsRow>
                        <Show when={settings.devMenusEnabled()}>
                            <div class="flex flex-row gap-2 justify-end">
                                {/* dev-facing, no i18n */}
                                <Button variant="ghost" onclick={() => sendTestToast("low")}>Test Toast (Low)</Button>
                                <Button variant="ghost" onclick={() => sendTestToast("high")}>Test Toast (High)</Button>
                            </div>
                        </Show>
                        <Show when={settings.savedCraftFilters().length > 0}>
                            <p class="text-xs text-muted-foreground">
                                <Show when={isLoggedIn()} fallback={<Trans>Log in for additional options such as Discord notifications.</Trans>}>
                                    <Trans>Discord columns appear once a channel or DM is linked via <code>/notify link</code>.</Trans>
                                </Show>
                            </p>
                            <div class="flex flex-col items-center">
                                <Button as="a" href={installDiscordBotUrl()} variant="outline">
                                    <Trans>Add the Brico.app bot to your Discord server</Trans>
                                </Button>
                            </div>
                            <For each={settings.savedCraftFilters()}>{saved => <NotifySettingsFilterCard filter={saved} discord={discord} onRequestUnlinkSink={setUnlinkSinkTarget} unlinkSinkBusy={unlinkSinkBusy()}/>}</For>
                        </Show>
                    </SettingsCard>
                </SettingsGroup>

                <SettingsGroup title={<Trans>Crafts</Trans>} description={<Trans>How bounties are displayed, and how payees are grouped.</Trans>}>
                    <SettingsCard>
                        <SettingsRow label={<Trans>Payout display</Trans>} description={<Trans>How bounty rates are shown and entered.</Trans>}>
                            <ButtonGroup<PayoutDisplayMode>
                                value={settings.payoutDisplayMode()}
                                onChange={settings.setPayoutDisplayMode}
                                options={[
                                    {value: "currencyPerEffort", icon: IconCurrency, label: _(msg`Currency / effort`)},
                                    {value: "effortPerCurrency", icon: IconEffort, label: _(msg`Effort / currency`)},
                                ]}
                            />
                        </SettingsRow>
                        <SettingsRow
                            label={<Trans>Currencies</Trans>}
                            description={<Trans>Which bounty currencies are offered. Currencies already in use stay visible.</Trans>}
                        >
                            <CurrencyVisibilitySelect/>
                        </SettingsRow>
                    </SettingsCard>

                    <LocalGroupingsManager
                        playerOptions={playerOptions()}
                        groupings={settings.localPayeeGroupings()}
                        onChange={settings.setLocalPayeeGroupings}
                    />
                </SettingsGroup>
            </div>

            <Dialog open={unlinkSinkTarget() !== null} onOpenChange={open => { if (!open) setUnlinkSinkTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle><Trans>Unlink this channel?</Trans></DialogTitle>
                        <DialogDescription>
                            <Trans>Notifications for every saved filter configured here will stop. You can link it again later with <code>/notify link</code>.</Trans>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUnlinkSinkTarget(null)}><Trans>Cancel</Trans></Button>
                        <Button variant="destructive" onClick={confirmUnlinkSink}><Trans>Unlink</Trans></Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MainLayout>
    );
}
