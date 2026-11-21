/**
 * StockLinksCard.tsx — edit which intake stalls feed which outlet stalls.
 */
import type {StockConfig, StockLink} from "@brico/trades/stock-config";
import type {LinkSuggestion} from "@brico/trades/stock-plan";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Plural, Trans} from "@lingui/solid/macro";
import {TbOutlinePlus as IconAdd, TbOutlineTrash as IconRemove} from "solid-icons/tb";
import {createMemo, createSignal, For, Show} from "solid-js";
import {type FieldOption, OptionPicker} from "~/components/crafts/FilterBuilder";
import {Button} from "~/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "~/components/ui/card";
import {byLabel} from "~/lib/crafts/options";

export function StockLinksCard(props: {
    config: StockConfig;
    stalls: {id: string; name: string}[];
    suggestions: LinkSuggestion[];
    onChange: (config: StockConfig) => void;
}) {
    const {_} = useLingui();
    const nameOf = (id: string) => props.stalls.find(stall => stall.id === id)?.name ?? id;
    const options = createMemo((): FieldOption[] => props.stalls.map(stall => ({value: stall.id, label: stall.name})).sort(byLabel));
    const [intake, setIntake] = createSignal<string | null>(null);
    const [outlet, setOutlet] = createSignal<string | null>(null);

    const setLinks = (links: StockLink[]) => props.onChange({...props.config, links});
    const add = (link: StockLink) => {
        if (link.intakeShopId === link.outletShopId) return;
        if (props.config.links.some(l => l.intakeShopId === link.intakeShopId && l.outletShopId === link.outletShopId)) return;
        setLinks([...props.config.links, link]);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle><Trans>Stall links</Trans></CardTitle>
                <CardDescription>
                    <Trans>
                        Link a stall that buys goods from players (intake) to the stall that sells them on (outlet).
                        Stalls that buy and sell the same goods themselves need no link.
                    </Trans>
                </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
                <div class="space-y-1">
                    <For each={props.config.links} fallback={<p class="text-sm text-muted-foreground"><Trans>No links yet.</Trans></p>}>
                        {link => (
                            <div class="flex items-center gap-2 text-sm">
                                <span>{nameOf(link.intakeShopId)}</span>
                                <span class="text-muted-foreground">→</span>
                                <span>{nameOf(link.outletShopId)}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-7"
                                    aria-label={_(msg`Remove link`)}
                                    onClick={() => setLinks(props.config.links.filter(other => other !== link))}
                                >
                                    <IconRemove class="size-4"/>
                                </Button>
                            </div>
                        )}
                    </For>
                </div>

                <Show when={props.suggestions.length > 0}>
                    <div class="space-y-1">
                        <h3 class="text-sm font-medium"><Trans>Suggested</Trans></h3>
                        <For each={props.suggestions}>
                            {suggestion => (
                                <div class="flex flex-wrap items-center gap-2 text-sm">
                                    <span>{nameOf(suggestion.intakeShopId)}</span>
                                    <span class="text-muted-foreground">→</span>
                                    <span>{nameOf(suggestion.outletShopId)}</span>
                                    <span class="text-muted-foreground">
                                        (<Plural value={suggestion.sharedGoods} one="# shared item" other="# shared items"/>)
                                    </span>
                                    <Button variant="outline" size="sm" class="h-7" onClick={() => add({intakeShopId: suggestion.intakeShopId, outletShopId: suggestion.outletShopId})}>
                                        <IconAdd class="mr-1 size-4"/><Trans>Link</Trans>
                                    </Button>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>

                <div class="flex flex-wrap items-center gap-2">
                    <div class="w-64">
                        <OptionPicker options={options()} selected={intake() ? [intake()!] : []} multiple={false} placeholder={_(msg`Intake stall`)} onChange={values => setIntake((values[0] as string) ?? null)}/>
                    </div>
                    <span class="text-muted-foreground">→</span>
                    <div class="w-64">
                        <OptionPicker options={options()} selected={outlet() ? [outlet()!] : []} multiple={false} placeholder={_(msg`Outlet stall`)} onChange={values => setOutlet((values[0] as string) ?? null)}/>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!intake() || !outlet() || intake() === outlet()}
                        onClick={() => {
                            add({intakeShopId: intake()!, outletShopId: outlet()!});
                            setIntake(null);
                            setOutlet(null);
                        }}
                    >
                        <IconAdd class="mr-1 size-4"/><Trans>Add link</Trans>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
