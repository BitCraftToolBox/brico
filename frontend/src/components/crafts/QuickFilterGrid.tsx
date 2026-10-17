/**
 * QuickFilterGrid.tsx — the craft browser's claim/player/item pickers and skill/tier toggle grids.
 */
import type {FilterValue} from "@brico/crafts/filter";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {For, Show} from "solid-js";
import {type FieldOption, OptionPicker} from "~/components/crafts/FilterBuilder";
import {FontIcon} from "~/components/icons/font-icons";
import {TierIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {cn} from "~/lib/utils";

export interface QuickFilterSkill {
    id: number;
    name: string;
    iconAssetName?: string;
}

/** One of the picker dropdowns: its option list and current selection. */
export interface QuickFilterPicker {
    options: FieldOption[];
    selected: FilterValue[];
    onChange: (values: FilterValue[]) => void;
}

/**
 * Reads `picker` through `props` so the `OptionPicker` is created once: the page hands in a fresh
 * `picker` object on every snapshot, and rebuilding the element would close an open dropdown.
 */
function QuickPicker(props: {picker: QuickFilterPicker; placeholder: string}) {
    return (
        <OptionPicker
            options={props.picker.options}
            selected={props.picker.selected}
            multiple
            placeholder={props.placeholder}
            onChange={values => props.picker.onChange(values)}
        />
    );
}

export function QuickFilterGrid(props: {
    claim: QuickFilterPicker;
    owner: QuickFilterPicker;
    item: QuickFilterPicker;
    skills: QuickFilterSkill[];
    tiers: number[];
    selectedSkills: ReadonlySet<number>;
    selectedTiers: ReadonlySet<number>;
    active: boolean;
    onToggleSkill: (id: number) => void;
    onToggleTier: (tier: number) => void;
}) {
    const {_} = useLingui();
    return (
        <div class="space-y-2 md:flex md:flex-wrap md:gap-4 md:justify-center">
            <div class={cn("flex flex-col flex-wrap justify-center gap-2", !props.active && "pointer-events-none opacity-50")}>
                <QuickPicker picker={props.claim} placeholder={_(msg`Claim`)}/>
                <QuickPicker picker={props.owner} placeholder={_(msg`Player`)}/>
                <QuickPicker picker={props.item} placeholder={_(msg`Item`)}/>
            </div>
            <div class="grid grid-cols-4 gap-y-1.5 gap-x-3">
                <For each={props.skills}>
                    {skill => {
                        const selected = () => props.selectedSkills.has(skill.id);
                        return (
                            <Button
                                type="button"
                                variant={selected() ? "default" : "ghost"}
                                size="sm"
                                class="h-12 sm:h-8 gap-1.5 [&_svg]:size-12 sm:[&_svg]:size-4"
                                disabled={!props.active}
                                aria-pressed={selected()}
                                onClick={() => props.onToggleSkill(skill.id)}
                            >
                                <Show when={skill.iconAssetName}>{icon => <FontIcon codepoint={icon()}/>}</Show>
                                <span class="hidden sm:inline">{skill.name}</span>
                            </Button>
                        );
                    }}
                </For>
            </div>
            <div class="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-3 gap-y-1.5 gap-x-3">
                <For each={props.tiers}>
                    {tier => {
                        const selected = () => props.selectedTiers.has(tier);
                        return (
                            <Button
                                type="button"
                                variant={selected() ? "default" : "ghost"}
                                size="sm"
                                class="h-12 sm:h-8 py-2 sm:py-0 lg:last:col-start-2 min-w-8 sm:min-w-4"
                                disabled={!props.active}
                                aria-pressed={selected()}
                                onClick={() => props.onToggleTier(tier)}
                            >
                                <TierIcon tier={tier} class="size-8 sm:size-4 min-w-8 sm:min-w-4"/>
                            </Button>
                        );
                    }}
                </For>
            </div>
        </div>
    );
}
