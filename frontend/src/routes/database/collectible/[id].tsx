import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {CollectibleType} from "~/bindings/src/collectible_type_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {KnowledgeTable} from "~/components/shared/RelTablePresets";
import {ItemLink} from "~/lib/game-links";
import {questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {questRequirementsTab, questRewardsTab} from "~/lib/table-utils/detail-tab-builders";

export default function CollectibleDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.CollectibleDesc);
    const index = BitCraftTables.CollectibleDesc.indexedBy("id");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const collectible = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const itemDeed = createMemo(() => {
        const c = collectible();
        if (!c?.itemDeedId) return undefined;
        return itemIndex()?.get(c.itemDeedId);
    });

    const knowledgesToUse = createMemo(() => {
        const c = collectible();
        if (!c?.requiredKnowledgesToUse?.length) return [];
        const idx = knowledgeIndex();
        if (!idx) return [];
        return c.requiredKnowledgesToUse.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    const knowledgesToConvert = createMemo(() => {
        const c = collectible();
        if (!c?.requiredKnowledgesToConvert?.length) return [];
        const idx = knowledgeIndex();
        if (!idx) return [];
        return c.requiredKnowledgesToConvert.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    const questRequires = createMemo(() => {
        const c = collectible();
        if (!c) return [];
        const byReq = questsRequiring("Collectible", c.id);
        const byCondition = questsWithStageCondition("Collectible", c.id);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewardsForCol = createMemo(() => {
        const c = collectible();
        if (!c) return [];
        return questsRewarding("Collectible", c.id);
    });

    return (
        <DetailPageLayout
            title={collectible()?.name ?? `Collectible #${params.id}`}
            loading={isLoading() && !collectible()}
            icon={<Show when={collectible()}>{c => <CollectibleIcon collectible={c()} small={false} noInteract/>}</Show>}
            name={collectible()?.name ?? "Collectible not found"}
            description={collectible()?.description}
            rarity={collectible()?.collectibleRarity?.tag}
            tag={collectible()?.tag}
            details={[
                {label: "Collectible Type", value: collectible()?.collectibleType?.tag},
                {label: "Invalidates Type", value: collectible()?.invalidatesType?.tag == CollectibleType.Default.tag ? undefined : collectible()?.invalidatesType?.tag},
                {label: "Auto Collect", value: collectible()?.autoCollect},
                {label: "Locked", value: collectible()?.locked},
                {label: "Starting Loadout", value: collectible()?.startingLoadout},
                {label: "Max Equip Count", value: collectible()?.maxEquipCount},
            ]}
            rawData={collectible()}
            spacetimeTable={BitCraftTables.CollectibleDesc.st_name}
            objectId={collectible()?.id}
            chatLink={`(col=${collectible()?.id})`}
            tabs={[
                {
                    id: "deed", label: "Item Deed", count: itemDeed() ? 1 : 0,
                    content: () => (
                        <Show when={itemDeed()}>
                            {d => <div class="p-1">
                                <ItemLink id={d().id} name={d().name}/>
                            </div>}
                        </Show>
                    ),
                },
                {
                    id: "knowledge-use",
                    label: "Required Knowledge",
                    count: knowledgesToUse().length,
                    showWhenEmpty: false,
                    content: () => <KnowledgeTable data={knowledgesToUse()}/>
                },
                {
                    id: "knowledge-convert",
                    label: "Required Knowledge (Convert)",
                    count: knowledgesToConvert().length,
                    showWhenEmpty: false,
                    content: () => <KnowledgeTable data={knowledgesToConvert()}/>
                },
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewardsForCol()),
            ]}
        />
    );
}
