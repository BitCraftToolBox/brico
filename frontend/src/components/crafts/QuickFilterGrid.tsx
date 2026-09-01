/**
 * QuickFilterGrid.tsx — the craft browser's skill/tier toggle grids.
 */
import {For, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {TierIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";

export interface QuickFilterSkill {
    id: number;
    name: string;
    iconAssetName?: string;
}

export function QuickFilterGrid(props: {
    skills: QuickFilterSkill[];
    tiers: number[];
    selectedSkills: ReadonlySet<number>;
    selectedTiers: ReadonlySet<number>;
    active: boolean;
    onToggleSkill: (id: number) => void;
    onToggleTier: (tier: number) => void;
}) {
    return (
        <div class="space-y-2 md:flex md:flex-wrap md:gap-4 md:justify-center">
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
