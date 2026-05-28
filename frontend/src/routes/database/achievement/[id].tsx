import {useNavigate, useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {AchievementTable} from "~/components/shared/RelTablePresets";
import {breadcrumb, CollectibleLink} from "~/lib/game-links";
import {achievementPrereqs, collectibleRewards, questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {questRequirementsTab, questRewardsTab} from "~/lib/table-utils/detail-tab-builders";

export default function AchievementDetail() {
    const params = useParams();
    const navigate = useNavigate();
    const isLoading = useTablesLoading(BitCraftTables.AchievementDesc);
    const index = BitCraftTables.AchievementDesc.indexedBy("id");

    const achievement = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const prereqs = createMemo(() => {
        const a = achievement();
        if (!a?.requisites?.length) return [];
        return achievementPrereqs(a.requisites);
    });

    const rewards = createMemo(() => {
        const a = achievement();
        if (!a?.collectibleRewards?.length) return [];
        return collectibleRewards(a.collectibleRewards);
    });

    const questRequires = createMemo(() => {
        const a = achievement();
        if (!a) return [];
        const byReq = questsRequiring("Achievement", a.id);
        const byCondition = questsWithStageCondition("Achievement", a.id);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewardsForAch = createMemo(() => {
        const a = achievement();
        if (!a) return [];
        return questsRewarding("Achievement", a.id);
    });

    return (
        <DetailPageLayout
            title={achievement()?.name ?? `Achievement #${params.id}`}
            breadcrumb={breadcrumb("/database/achievement")}
            loading={isLoading() && !achievement()}
            name={achievement()?.name ?? "Achievement not found"}
            description={achievement()?.description}
            tag={`${achievement()?.pointsReward} points`}
            rawData={achievement()}
            spacetimeTable={BitCraftTables.AchievementDesc.st_name}
            objectId={achievement()?.id}
            tabs={[
                {id: "prereqs", label: "Prerequisites", count: prereqs().length, content: () => <AchievementTable data={prereqs()}/>},
                {
                    id: "rewards", label: "Rewards", count: rewards().length,
                    content: () => (
                        <RelTable<CollectibleDesc>
                            data={rewards()}
                            columns={[
                                {header: "Collectible", cell: (row) => <CollectibleLink id={row.id} name={row.name}/>},
                                {header: "Type", cell: (row) => <span>{row.collectibleType?.tag}</span>},
                            ]}
                            onRowClick={(row) => navigate(`/database/collectible/${row.id}`)}
                        />
                    ),
                },
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewardsForAch()),
            ]}
        />
    );
}
