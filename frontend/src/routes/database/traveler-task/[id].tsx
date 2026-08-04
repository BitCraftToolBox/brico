import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {RecipeSelect, TravelerTaskPanel} from "~/components/shared/RecipeDisplay";
import {SkillLinkById} from "~/lib/game-links";
import {ogImageForPage} from "~/lib/og-meta";
import {getTravelerTaskName} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

export default function TravelerTaskDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.TravelerTaskDesc);
    const index = BitCraftTables.TravelerTaskDesc.indexedBy("id");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");

    const task = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const skillName = createMemo(() => {
        const t = task();
        if (!t) return undefined;
        return skillIndex().get(t.levelRequirement?.skillId)?.name;
    });

    const xpStr = createMemo(() => {
        const t = task();
        if (!t?.rewardedExperience) return undefined;
        const name = skillIndex()?.get(t.rewardedExperience.skillId)?.name ?? "Skill";
        return `${name}: ${fixFloat(t.rewardedExperience.quantity)}`;
    });

    return (
        <DetailPageLayout
            title={`${skillName() ?? "Task"} Task #${params.id}`}
            breadcrumbHref="/database/traveler-task"
            loading={isLoading() && !task()}
            name={`${skillName() ?? "Task"} Task`}
            description={task()?.description}
            metaKind="traveler task"
            metaImage={ogImageForPage("Traveler Tasks")}
            details={[
                {label: msg`Skill`, value: task()?.levelRequirement?.skillId ? () => <SkillLinkById skillId={task()!.levelRequirement.skillId}/> : undefined},
                {label: msg`Level Range`, value: task() ? `${task()!.levelRequirement.minLevel}–${task()!.levelRequirement.maxLevel}` : undefined},
                {label: msg`XP Reward`, value: xpStr()},
            ]}
            rawData={task()}
            spacetimeTable={BitCraftTables.TravelerTaskDesc.spacetimeName}
            objectId={task()?.id}
            tabs={[
                {
                    id: "traveler-task",
                    label: msg`Traveler Task`,
                    content: () => (
                        <div class="space-y-4">
                            <Show when={task()}>
                                {t =>
                                    <RecipeSelect
                                        recipes={[t()]}
                                        nameFor={getTravelerTaskName}
                                        render={tt => <TravelerTaskPanel task={tt}/>}
                                    />
                                }
                            </Show>
                        </div>
                    )
                }
            ]}
        />
    );
}

