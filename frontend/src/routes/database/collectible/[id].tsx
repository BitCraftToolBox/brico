import {CollectibleDesc, CollectibleType, DeployableDesc, PremiumItemDesc, SecondaryKnowledgeDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CollectibleIcon, GameIcon} from "~/components/shared/GameIcon";
import {HexiteShardPrice} from "~/components/shared/HexiteShardPrice.tsx";
import {KnowledgeTable} from "~/components/shared/RelTablePresets";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {chatLink} from "~/lib/chat-links";
import {translateGameText} from "~/lib/data-translation";
import {IconLink, ItemLink, pageIcon, PremiumItemLink} from "~/lib/game-links";
import {collectibleTypeLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
import {ogImageForAsset} from "~/lib/og-meta";
import {premiumItemsIncluding, questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
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
        return index().get(id);
    });

    const itemDeed = createMemo(() => {
        const c = collectible();
        if (!c?.itemDeedId) return undefined;
        return itemIndex().get(c.itemDeedId);
    });

    const knowledgesToUse = createMemo(() => {
        const c = collectible();
        if (!c?.requiredKnowledgesToUse?.length) return [];
        const idx = knowledgeIndex();
        return c.requiredKnowledgesToUse.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    const knowledgesToConvert = createMemo(() => {
        const c = collectible();
        if (!c?.requiredKnowledgesToConvert?.length) return [];
        const idx = knowledgeIndex();
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

    const premiumItems = createMemo(() => {
        const c = collectible();
        return c ? premiumItemsIncluding(c.id) : [];
    });

    const deployables = createMemo(() => {
        const c = collectible();
        if (!c) return [];
        if (c.collectibleType.tag === "DeployableAppearanceOverride") {
            const appearances = BitCraftTables.DeployableAppearanceOverrideDesc.indexedBy("collectibleId")();
            const appearance = appearances.get(c.id);
            if (!appearance) return [];
            const models = new Set(appearance.affectedModelAddresses ?? []);
            models.add(appearance.affectedModelAddress); // already in there for every existing case, but just to be sure
            const deployables = BitCraftTables.DeployableDesc.get();
            return deployables?.filter(d => models.has(d.modelAddress))
                .map(d => [d, index().get(d.deployFromCollectibleId)])
                .filter((p): p is [DeployableDesc, CollectibleDesc] => !!p[1]) ?? [];
        } else if (c.collectibleType.tag === "Deployable") {
            const deployables = BitCraftTables.DeployableDesc.indexedBy("deployFromCollectibleId");
            const dep = deployables().get(c.id);
            return dep ? [[dep, c]] as [DeployableDesc, CollectibleDesc][] : [];
        } else {
            return [];
        }
    })

    return (
        <DetailPageLayout
            title={collectible()?.name ?? `Collectible #${params.id}`}
            breadcrumbHref="/database/collectible"
            loading={isLoading() && !collectible()}
            icon={<Show when={collectible()}>{c => <CollectibleIcon collectible={c()} small={false} noInteract/>}</Show>}
            name={collectible()?.name ?? "Collectible not found"}
            description={collectible()?.description}
            rarity={collectible()?.collectibleRarity?.tag}
            tag={collectible()?.tag}
            metaKind="collectible"
            metaImage={ogImageForAsset(collectible()?.iconAssetName)}
            details={[
                {label: msg`Collectible Type`, value: collectibleTypeLabel(collectible()?.collectibleType?.tag)},
                {label: msg`Invalidates Type`, value: collectible()?.invalidatesType?.tag == CollectibleType.Default.tag ? undefined : collectibleTypeLabel(collectible()?.invalidatesType?.tag)},
                {label: msg`Auto Collect`, value: collectible()?.autoCollect},
                {label: msg`Locked`, value: collectible()?.locked},
                {label: msg`Starting Loadout`, value: collectible()?.startingLoadout},
                {label: msg`Max Equip Count`, value: collectible()?.maxEquipCount},
            ]}
            rawData={collectible()}
            spacetimeTable={BitCraftTables.CollectibleDesc.spacetimeName}
            objectId={collectible()?.id}
            chatLink={chatLink("coll", collectible()?.id)}
            tabs={[
                {
                    id: "hexite-exchange",
                    label: gameText(msg`Hexite Exchange`),
                    count: premiumItems().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<PremiumItemDesc> data={premiumItems()} columns={[
                            {
                                header: msg`Premium Item`,
                                cell: p => (
                                    <span class="inline-flex items-center gap-2">
                                        <GameIcon name={p.name} iconAsset={p.imageAddress} shape="square" small noInteract/>
                                        <PremiumItemLink id={p.id} name={p.name} showIcon={false}/>
                                    </span>
                                ),
                            },
                            // bundles have multiple occurrences of one id, while a single item is sold by quantity.
                            {header: msg`Quantity`, cell: p => <span>{p.collectibleIds.filter(id => id === collectible()?.id).length * p.quantity}</span>},
                            {header: msg`Price`, cell: p => <HexiteShardPrice amount={p.price}/>},
                            {header: msg`Enabled`, cell: p => <>{translateGameText(p.isEnabled ? "Yes" : "No")}</>},
                        ]}/>
                    )
                },
                {
                    id: "deployables",
                    label: gameText(msg`Deployables`),
                    count: deployables().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<[DeployableDesc, CollectibleDesc]> data={deployables()} columns={[
                            {header: gameText(msg`Deployable`), cell: d => <CollectibleIcon collectible={d[1]} small noInteract/>, class: "w-10"},
                            {header: gameText(msg`Name`), cell: d => <IconLink href={`/database/deployable/${d[0].id}`} icon={pageIcon("Deployables")}>{d[0].name}</IconLink>},
                        ]} />
                    )
                },
                {
                    id: "deed", label: gameText(msg`Deed`), count: itemDeed() ? 1 : 0,
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
                    label: msg`Required Knowledge`,
                    count: knowledgesToUse().length,
                    showWhenEmpty: false,
                    content: () => <KnowledgeTable data={knowledgesToUse()}/>
                },
                {
                    id: "knowledge-convert",
                    label: msg`Required Knowledge (Convert)`,
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
