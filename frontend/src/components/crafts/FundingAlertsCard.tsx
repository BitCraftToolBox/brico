import {MAX_NOTIFY_TEMPLATE_LENGTH} from "@brico/crafts/errors";
import {DEFAULT_FUNDING_NOTIFY_TEMPLATE, FUNDING_NOTIFY_EVENTS, type FundingNotifyEvent} from "@brico/crafts/stelo";
import type {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineRestore as IconRestore, TbOutlineSettings as IconSettings} from "solid-icons/tb";
import {createSignal, For, Show} from "solid-js";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {Checkbox} from "~/components/ui/checkbox";
import {Collapsible, CollapsibleContent} from "~/components/ui/collapsible";
import {TextField, TextFieldInput, TextFieldLabel} from "~/components/ui/text-field";
import {createFundingNotifySettings} from "~/lib/crafts/funding-notify-settings";
import {cn} from "~/lib/utils";

const EVENT_LABELS: Record<FundingNotifyEvent, MessageDescriptor> = {
    fundingFailed: msg`Funding failed`,
    payoutShortfall: msg`Payout shortfall`,
    unclaimed: msg`Unclaimed money moved`,
};

/**
 * Funding alerts: which of the three Stelo funding events notify through the in-site toast and each
 * linked Discord channel, plus per-channel wording. Independent of any saved filter. Render only
 * while logged in.
 */
export function FundingAlertsCard() {
    const {_} = useLingui();
    const settings = createFundingNotifySettings();
    const [expanded, setExpanded] = createSignal<string | null>(null);

    const setDiscordEvent = (sinkId: string, event: FundingNotifyEvent, checked: boolean) => {
        settings.setFlag(sinkId, event, checked);
        // Prefill the default wording when enabling an event that has none.
        if (checked && !settings.templatesFor(sinkId)[event]) settings.setTemplate(sinkId, event, DEFAULT_FUNDING_NOTIFY_TEMPLATE[event]);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle class="text-base"><Trans>Funding alerts</Trans></CardTitle>
                <CardDescription>
                    <Trans>
                        Get told when a bounty can't be funded from your Stelo wallet, a payout can't be pulled, or unclaimed money is moved.
                        Discord channels appear once linked via <code>/watch notify-link</code>.
                    </Trans>
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-2">
                <div class="overflow-x-auto py-2">
                    <div
                        class="grid items-center justify-items-center gap-x-4 gap-y-1.5"
                        style={{"grid-template-columns": `auto repeat(${1 + settings.sinks().length}, auto)`}}
                    >
                        <span/>
                        <span class="text-xs text-muted-foreground"><Trans>Toast</Trans></span>
                        <For each={settings.sinks()}>
                            {sink => <span class="text-xs text-muted-foreground truncate min-w-fit max-w-32" title={sink.channelName ?? sink.channelId}>{sink.channelName ?? sink.channelId}</span>}
                        </For>

                        <span class="justify-self-start text-xs text-muted-foreground"><Trans>Settings</Trans></span>
                        <span/>
                        <For each={settings.sinks()}>
                            {sink => (
                                <button
                                    type="button"
                                    aria-label={_(msg`Customize funding alerts for ${sink.channelName ?? sink.channelId}`)}
                                    aria-pressed={expanded() === sink.id}
                                    title={_(msg`Customize funding alerts for ${sink.channelName ?? sink.channelId}`)}
                                    class={cn(
                                        "flex items-center justify-center rounded-sm p-1 transition-colors",
                                        expanded() === sink.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                    )}
                                    onClick={() => setExpanded(expanded() === sink.id ? null : sink.id)}
                                >
                                    <IconSettings class="size-4"/>
                                </button>
                            )}
                        </For>

                        <For each={FUNDING_NOTIFY_EVENTS}>
                            {event => (
                                <>
                                    <span class="justify-self-start text-xs">{_(EVENT_LABELS[event])}</span>
                                    <Checkbox checked={settings.flagsFor(null)[event]} onChange={(checked: boolean) => settings.setFlag(null, event, checked)}/>
                                    <For each={settings.sinks()}>
                                        {sink => <Checkbox checked={settings.flagsFor(sink.id)[event]} onChange={(checked: boolean) => setDiscordEvent(sink.id, event, checked)}/>}
                                    </For>
                                </>
                            )}
                        </For>
                    </div>
                </div>
                <For each={settings.sinks()}>
                    {sink => (
                        <Collapsible open={expanded() === sink.id}>
                            <CollapsibleContent class="flex flex-col gap-2 pt-2">
                                <p class="text-xs text-muted-foreground">
                                    <Trans>Mention: {settings.mentionFor(sink.id)?.name ?? _(msg`(none)`)}</Trans>
                                    {" — "}
                                    <Trans>set via <code>/watch funding-setup</code> in Discord.</Trans>
                                </p>
                                <For each={FUNDING_NOTIFY_EVENTS}>
                                    {event => (
                                        <TextField>
                                            <TextFieldLabel class="text-xs">{_(EVENT_LABELS[event])}</TextFieldLabel>
                                            <div class="flex items-center gap-1">
                                                <TextFieldInput
                                                    value={settings.templatesFor(sink.id)[event] ?? ""}
                                                    maxLength={MAX_NOTIFY_TEMPLATE_LENGTH}
                                                    onInput={(e: InputEvent & {currentTarget: HTMLInputElement}) => settings.setTemplate(sink.id, event, e.currentTarget.value)}
                                                />
                                                <button
                                                    type="button"
                                                    aria-label={_(msg`Reset to default wording`)}
                                                    title={_(msg`Reset to default wording`)}
                                                    class="shrink-0 rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                    onClick={() => settings.setTemplate(sink.id, event, DEFAULT_FUNDING_NOTIFY_TEMPLATE[event])}
                                                >
                                                    <IconRestore class="size-4"/>
                                                </button>
                                            </div>
                                        </TextField>
                                    )}
                                </For>
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                </For>
                <Show when={settings.lastError()}>{error => <p class="text-sm text-destructive">{error()}</p>}</Show>
            </CardContent>
        </Card>
    );
}
