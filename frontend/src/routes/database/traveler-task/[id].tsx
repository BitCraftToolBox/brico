import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemStackTable} from "~/components/shared/RelTablePresets";
import {breadcrumb, SkillLinkById} from "~/lib/game-links";
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
        return index()?.get(id);
    });

    const skillName = createMemo(() => {
        const t = task();
        if (!t) return undefined;
        return skillIndex()?.get(t.levelRequirement?.skillId)?.name;
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
            breadcrumb={breadcrumb("/database/traveler-task")}
            loading={isLoading() && !task()}
            name={`${skillName() ?? "Task"} Task`}
            description={task()?.description}
            details={[
                {label: "Skill", value: task()?.levelRequirement?.skillId ? <SkillLinkById skillId={task()!.levelRequirement.skillId}/> : undefined},
                {label: "Level Range", value: task() ? `${task()!.levelRequirement.minLevel}–${task()!.levelRequirement.maxLevel}` : undefined},
                {label: "XP Reward", value: xpStr()},
            ]}
            rawData={task()}
            spacetimeTable={BitCraftTables.TravelerTaskDesc.st_name}
            objectId={task()?.id}
            tabs={[
                {id: "required", label: "Required Items", count: task()?.requiredItems?.length ?? 0, content: () => <ItemStackTable data={task()!.requiredItems}/>},
                {id: "rewarded", label: "Rewarded Items", count: task()?.rewardedItems?.length ?? 0, content: () => <ItemStackTable data={task()!.rewardedItems}/>},
            ]}
        />
    );
}

