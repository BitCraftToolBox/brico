import {msg} from "@lingui/core/macro";
import {A} from "@solidjs/router";
import {createMemo, For} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {SkillBanner} from "~/components/shared/GameIcon";
import {breadcrumbCurrent} from "~/lib/game-links";
import {gameText, useLabel} from "~/lib/labels";
import {BITCRAFT_TITLE_SUFFIX} from "~/lib/og-meta";
import {BitCraftTables} from "~/lib/spacetime";
import {cn} from "~/lib/utils";

export default function ProgressionNavIcons() {
    const label = useLabel();

    const profs = createMemo(() => {
       const index = BitCraftTables.SkillDesc.get();
       if (!index) return undefined;
       return index.filter(s => s.skillCategory.tag === "Profession");
    });

    const skills = createMemo(() => {
        const index = BitCraftTables.SkillDesc.get();
        if (!index) return undefined;
        return index.filter(s => s.skillCategory.tag === "Adventure");
    });

    const title = gameText(msg`Progression`);

    const profLabel = gameText(msg`Profession`);
    const skillLabel = gameText(msg`Skill`);

    // manual, to make it more obvious what's WIP or not. eventually this can be removed
    const hasRework = [
        12, // Fishing
        5, // Mining
        2, // Forestry
        14, // Foraging
    ];

    return (
        <MainLayout
            title={label(title)}
            titleSuffix={BITCRAFT_TITLE_SUFFIX}
            description="BitCraft skill progression: view profession unlocks, abilities, and more."
            navTitle={breadcrumbCurrent("/database/progression")}
        >
            <div class="flex flex-col gap-8 max-w-4xl mx-auto w-full">
                <For each={[[profLabel, profs] as const, [skillLabel, skills] as const]}>
                    {([sectionLabel, skills]) => (
                        <section>
                            <h2 class="text-lg font-semibold mb-3 border-b pb-1">{label(sectionLabel)}</h2>
                            <div class="grid grid-cols-3 md:grid-cols-4 gap-2">
                                <For each={skills()}>
                                    {(skill) => (
                                        <A
                                            href={`/database/skill/${skill.id}?detail=progression`}
                                            class={cn(
                                                "flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors hover:bg-accent/60",
                                                (!hasRework.includes(skill.id) ? "text-muted-foreground" : "")
                                            )}
                                        >
                                            <SkillBanner skill={skill} class="w-20"/>
                                            <span class="text-xs w-full">{skill.name}</span>
                                        </A>
                                    )}
                                </For>
                            </div>
                        </section>
                    )}
                </For>
            </div>
        </MainLayout>
    );
}
