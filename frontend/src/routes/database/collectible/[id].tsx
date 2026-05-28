import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {CollectibleType} from "~/bindings/src/collectible_type_type";
import {DeployableDesc} from "~/bindings/src/deployable_desc_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon} from "~/components/shared/GameIcon";
import {KnowledgeTable} from "~/components/shared/RelTablePresets";
import {breadcrumb, IconLink, ItemLink, pageIcon} from "~/lib/game-links";
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

    const deployables = createMemo(() => {
        const c = collectible();
        if (!c) return [];
        if (c.collectibleType.tag === "DeployableAppearanceOverride") {
            const appearances = BitCraftTables.DeployableAppearanceOverrideDesc.indexedBy("collectibleId")();
            const appearance = appearances?.get(c.id);
            if (!appearance) return [];
            const model = appearance.affectedModelAddress;
            const deployables = BitCraftTables.DeployableDesc.get();
            return deployables?.filter(d => d.modelAddress === model)
                .map(d => [d, index().get(d.deployFromCollectibleId)])
                .filter((p): p is [DeployableDesc, CollectibleDesc] => !!p[1]) ?? [];
        } else if (c.collectibleType.tag === "Deployable") {
            const deployables = BitCraftTables.DeployableDesc.indexedBy("deployFromCollectibleId");
            const dep = deployables()?.get(c.id);
            return dep ? [[dep, c]] as [DeployableDesc, CollectibleDesc][] : [];
        } else {
            return [];
        }
    })

    return (
        <DetailPageLayout
            title={collectible()?.name ?? `Collectible #${params.id}`}
            breadcrumb={breadcrumb("/database/collectible")}
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
                    id: "deployables",
                    label: "Deployables",
                    count: deployables().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<[DeployableDesc, CollectibleDesc]> data={deployables()} columns={[
                            {header: "Deployable", cell: d => <CollectibleIcon collectible={d[1]} small noInteract/>, class: "w-10"},
                            {header: "Name", cell: d => <IconLink href={`/database/deployable/${d[0].id}`} icon={pageIcon("Deployables")}>{d[0].name}</IconLink>},
                        ]} />
                    )
                },
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
