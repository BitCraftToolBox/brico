import {CargoDesc, ItemDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {Accessor, createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {CargoIcon, ItemIcon} from "~/components/shared/GameIcon";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {chatLink} from "~/lib/chat-links";
import {CargoLink, ItemLink} from "~/lib/game-links";
import {statLabel} from "~/lib/game-strings";
import {ogImageForAsset} from "~/lib/og-meta";
import {knowledgeUsedBy, questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
import {knowledgeUsedByTab, questRequirementsTab, questRewardsTab} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat} from "~/lib/utils";

export default function KnowledgeDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SecondaryKnowledgeDesc);
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const knowledge = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return knowledgeIndex().get(id);
    });

    const scroll = createMemo(() => {
        const k = knowledge();
        if (!k) return undefined;
        return BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")().get(k.id);
    });

    const statMod = createMemo(() => {
        const k = knowledge();
        if (!k) return undefined;
        return BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")().get(k.id);
    });

    type KnowledgeItem =
        | {type: "scroll", item: ItemDesc}
        | {type: "item", item: ItemDesc}
        | {type: "cargo", item: CargoDesc}
    ;

    const item: Accessor<KnowledgeItem | undefined> = createMemo(() => {
        const s = scroll();
        if (s) {
            const i = BitCraftTables.ItemDesc.indexedBy("id")().get(s.itemId);
            if (i) return {type: "scroll", item: i} satisfies KnowledgeItem;
        }
        const itemIdx = BitCraftTables.ItemDesc.indexedBy("secondaryKnowledgeId");
        const i = itemIdx().get(knowledge()!.id);
        if (i) return {type: "item", item: i} satisfies KnowledgeItem;
        const cargoIdx = BitCraftTables.CargoDesc.indexedBy("secondaryKnowledgeId");
        const c = cargoIdx().get(knowledge()!.id);
        if (c) return {type: "cargo", item: c} satisfies KnowledgeItem;
        return undefined;
    });

    const questRequires = createMemo(() => {
        const k = knowledge();
        if (!k) return [];
        const byReq = questsRequiring("SecondaryKnowledge", k.id);
        const byCondition = questsWithStageCondition("SecondaryKnowledge", k.id);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewards = createMemo(() => {
        const k = knowledge();
        if (!k) return [];
        return questsRewarding("SecondaryKnowledge", k.id);
    });

    const usedBy = createMemo(() => {
        const k = knowledge();
        if (!k) return [];
        return knowledgeUsedBy(k.id);
    });

    const details = createMemo((): DetailGroup[] => {
        const groups: DetailGroup[] = [];
        const s = scroll();
        if (s) {
            groups.push({
                properties: [
                    {label: msg`Title`, value: s.title},
                    {label: msg`Tag`, value: s.tag},
                    {label: msg`Known By Default`, value: s.knownByDefault},
                    {label: msg`Auto Collect`, value: s.autoCollect},
                ],
            });
        }
        const mod = statMod();
        if (mod?.stats?.length) {
            groups.push({
                heading: msg`Stats`,
                properties: mod.stats.map(s => ({
                    label: statLabel(s.id?.tag),
                    value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                })),
            });
        }
        return groups;
    });

    return (
        <DetailPageLayout
            title={knowledge()?.name ?? `Knowledge #${params.id}`}
            breadcrumbHref="/database/knowledge"
            loading={isLoading() && !knowledge()}
            icon={
                <Show when={item()} keyed>
                    {(i) =>
                        <Show when={i.type === "cargo"} fallback={<ItemIcon item={i.item as ItemDesc} small={false} noInteract/>}>
                            <CargoIcon cargo={i.item as CargoDesc} small={false} noInteract/>
                        </Show>
                    }
                </Show>
            }
            iconIsWide={item()?.type === "cargo"}
            name={knowledge()?.name ?? `Knowledge #${params.id}`}
            description={scroll()?.content}
            tag={scroll()?.tag}
            metaKind="knowledge"
            metaImage={ogImageForAsset(item()?.item.iconAssetName)}
            details={details()}
            rawData={knowledge()}
            spacetimeTable={BitCraftTables.SecondaryKnowledgeDesc.spacetimeName}
            objectId={knowledge()?.id}
            chatLink={scroll() ? chatLink("know", scroll()!.itemId) : undefined}
            tabs={[
                {
                    id: "item", label: msg`Item`, count: item() ? 1 : 0,
                    content: () => (
                        <RelTable<KnowledgeItem> data={[item()!]} columns={[
                            {header: msg`Item`, cell: ki => (
                                <Show when={ki.type === "cargo"} fallback={<ItemLink id={ki.item.id} name={ki.item.name}/>}>
                                    <CargoLink id={ki.item.id} name={ki.item.name}/>
                                </Show>
                            )}
                        ]}/>
                    ),
                },
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewards()),
                knowledgeUsedByTab(usedBy()),
            ]}
        />
    );
}
