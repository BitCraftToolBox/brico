import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {SecondaryKnowledgeDesc} from "~/bindings/src/secondary_knowledge_desc_type";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {InputItemStackTable, KnowledgeTable, StatTable} from "~/components/shared/RelTablePresets";
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
        return index()?.get(id);
    });

    const experienceStr = createMemo(() => {
        const t = tile();
        if (!t?.experiencePerProgress?.length) return undefined;
        return t.experiencePerProgress.map(exp => {
            const name = skillIndex()?.get(exp.skillId)?.name ?? `Skill ${exp.skillId}`;
            return `${name}: ${fixFloat(exp.quantity, 4)}`;
        }).join(", ");
    });

    const requiredKnowledges = createMemo(() => {
        const t = tile();
        if (!t?.requiredKnowledges?.length) return [];
        const idx = knowledgeIndex();
        if (!idx) return [];
        return t.requiredKnowledges.map(id => idx.get(id)).filter((v): v is SecondaryKnowledgeDesc => !!v);
    });

    return (
        <DetailPageLayout
            title={tile()?.name ?? `Paving Tile #${params.id}`}
            loading={isLoading() && !tile()}
            icon={<Show when={tile()}>{(t) =>
                <GameIcon name={t().name} iconAsset={t().iconAddress} shape="square"
                          small={false} tier={t().tier} noInteract/>
            }</Show>}
            name={tile()?.name ?? "Paving tile not found"}
            tier={tile()?.tier}
            description={tile()?.description}
            details={[
                {label: "Experience", value: experienceStr()},
                {label: "Build Time", value: tile() ? `${fixFloat(tile()!.pavingDuration)}s` : undefined},
            ]}
            rawData={tile()}
            spacetimeTable={BitCraftTables.PavingTileDesc.st_name}
            objectId={tile()?.id}
            tabs={[
                {id: "consumed", label: "Consumed Items", count: tile()?.consumedItemStacks?.length ?? 0, content: () => <InputItemStackTable data={tile()!.consumedItemStacks}/>},
                {id: "knowledge", label: "Required Knowledge", count: requiredKnowledges().length, content: () => <KnowledgeTable data={requiredKnowledges()}/>},
                {id: "stats", label: "Stat Effects", count: tile()?.statEffects?.length ?? 0, content: () => <StatTable data={tile()!.statEffects}/>},
            ]}
        />
    );
}
