import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {ItemType} from "~/bindings/src/item_type_type";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {InputItemStackArray, ItemStackArray} from "~/components/shared/ItemStacks";
import {KnowledgeTable} from "~/components/shared/RelTablePresets";
import {ogImageForAsset} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

export default function PillarShapingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.PillarShapingDesc);
    const index = BitCraftTables.PillarShapingDesc.indexedBy("id");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const pillar = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const experienceStr = createMemo(() => {
        const p = pillar();
        if (!p?.experiencePerProgress?.length) return undefined;
        return p.experiencePerProgress.map(exp => {
            const name = skillIndex().get(exp.skillId)?.name ?? `Skill ${exp.skillId}`;
            return `${name}: ${fixFloat(exp.quantity, 4)}`;
        }).join(", ");
    });

    const requiredKnowledges = createMemo(() => {
        const p = pillar();
        if (!p?.requiredKnowledges?.length) return [];
        const idx = knowledgeIndex();
        return p.requiredKnowledges.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    return (
        <DetailPageLayout
            title={pillar()?.name ?? `Pillar Shaping #${params.id}`}
            breadcrumbHref="/database/pillar-shaping"
            loading={isLoading() && !pillar()}
            icon={<Show when={pillar()}>{(p) =>
                <GameIcon name={p().name} iconAsset={p().iconAddress} shape="square"
                          small={false} tier={p().tier} noInteract/>
            }</Show>}
            name={pillar()?.name ?? "Pillar Shaping recipe not found"}
            tier={pillar()?.tier}
            description={pillar()?.description}
            metaKind="pillar shaping"
            metaImage={ogImageForAsset(pillar()?.iconAddress)}
            details={[
                {label: msg`Experience`, value: experienceStr()},
                {label: msg`Build Time`, value: pillar() ? `${fixFloat(pillar()!.duration)}s` : undefined},
            ]}
            rawData={pillar()}
            spacetimeTable={BitCraftTables.PillarShapingDesc.spacetimeName}
            objectId={pillar()?.id}
            tabs={[
                {
                    id: "consumed",
                    label: msg`Consumed Items`,
                    count: pillar() ? pillar()!.consumedItemStacks.length + (pillar()!.inputCargoId > 0 ? 1 : 0) : 0,
                    showWhenEmpty: false,
                    content: () => <div class="flex flex-row flex-wrap justify-center gap-2">
                        <InputItemStackArray stacks={pillar()!.consumedItemStacks}/>
                        <Show when={pillar()!.inputCargoId}>
                            {c => <ItemStackArray stacks={[{itemId: c(), itemType: ItemType.Cargo as ItemType, quantity: 1, durability: undefined}]}/>}
                        </Show>
                    </div>,
                },
                {id: "knowledge", label: msg`Required Knowledge`, count: requiredKnowledges().length, showWhenEmpty: false, content: () => <KnowledgeTable data={requiredKnowledges()}/>},
            ]}
        />
    );
}
