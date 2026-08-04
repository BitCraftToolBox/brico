import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {breadcrumb, CollectibleLink} from "~/lib/game-links";
import {collectibleTypeLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
import {ogImageForPage} from "~/lib/og-meta";
import {achievementRequirements, collectibleRewards, questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {achievementRequirementsTab, questRequirementsTab, questRewardsTab} from "~/lib/table-utils/detail-tab-builders";

export default function AchievementDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.AchievementDesc);
    const index = BitCraftTables.AchievementDesc.indexedBy("id");

    const achievement = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const requirements = createMemo(() => {
        const a = achievement();
        if (!a) return [];
        return achievementRequirements(a);
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
            metaKind="achievement"
            metaImage={ogImageForPage("Achievements")}
            rawData={achievement()}
            spacetimeTable={BitCraftTables.AchievementDesc.spacetimeName}
            objectId={achievement()?.id}
            tabs={[
                achievementRequirementsTab(requirements()),
                {
                    id: "rewards", label: gameText(msg`Rewards`), count: rewards().length,
                    content: () => (
                        <RelTable<CollectibleDesc>
                            data={rewards()}
                            columns={[
                                {header: gameText(msg`Collectible`), cell: (row) => <CollectibleLink id={row.id} name={row.name}/>},
                                {header: msg`Type`, cell: (row) => <span>{collectibleTypeLabel(row.collectibleType.tag)}</span>},
                            ]}
                        />
                    ),
                },
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewardsForAch()),
            ]}
        />
    );
}
