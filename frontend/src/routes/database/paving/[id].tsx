import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {InputItemStackArray} from "~/components/shared/ItemStacks";
import {KnowledgeTable, StatTable} from "~/components/shared/RelTablePresets";
import {breadcrumb} from "~/lib/game-links";
import {ogImageForAsset} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

export default function PavingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.PavingTileDesc);
    const index = BitCraftTables.PavingTileDesc.indexedBy("id");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const tile = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const experienceStr = createMemo(() => {
        const t = tile();
        if (!t?.experiencePerProgress?.length) return undefined;
        return t.experiencePerProgress.map(exp => {
            const name = skillIndex().get(exp.skillId)?.name ?? `Skill ${exp.skillId}`;
            return `${name}: ${fixFloat(exp.quantity, 4)}`;
        }).join(", ");
    });

    const requiredKnowledges = createMemo(() => {
        const t = tile();
        if (!t?.requiredKnowledges?.length) return [];
        const idx = knowledgeIndex();
        return t.requiredKnowledges.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    return (
        <DetailPageLayout
            title={tile()?.name ?? `Paving Tile #${params.id}`}
            breadcrumb={breadcrumb("/database/paving")}
            loading={isLoading() && !tile()}
            icon={<Show when={tile()}>{(t) =>
                <GameIcon name={t().name} iconAsset={t().iconAddress} shape="square"
                          small={false} tier={t().tier} noInteract/>
            }</Show>}
            name={tile()?.name ?? "Paving tile not found"}
            tier={tile()?.tier}
            description={tile()?.description}
            metaKind="paving"
            metaImage={ogImageForAsset(tile()?.iconAddress)}
            details={[
                {label: msg`Experience`, value: experienceStr()},
                {label: msg`Build Time`, value: tile() ? `${fixFloat(tile()!.pavingDuration)}s` : undefined},
            ]}
            rawData={tile()}
            spacetimeTable={BitCraftTables.PavingTileDesc.spacetimeName}
            objectId={tile()?.id}
            tabs={[
                {
                    id: "consumed",
                    label: msg`Consumed Items`,
                    count: tile()?.consumedItemStacks?.reduce((p, iis) => p + iis.quantity, 0) ?? 0,
                    showWhenEmpty: false,
                    content: () => <InputItemStackArray stacks={tile()!.consumedItemStacks}/>,
                },
                {id: "knowledge", label: msg`Required Knowledge`, count: requiredKnowledges().length, content: () => <KnowledgeTable data={requiredKnowledges()}/>},
                {id: "stats", label: msg`Stat Effects`, count: tile()?.statEffects?.length ?? 0, content: () => <StatTable data={tile()!.statEffects}/>},
            ]}
        />
    );
}
