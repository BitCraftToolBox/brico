import {ItemType, PlaceableDesc, SecondaryKnowledgeDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {modelTab} from "~/components/model-viewer/model-tab";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {InputItemStackArray, ItemStackArray} from "~/components/shared/ItemStacks";
import {KnowledgeTable, StatTable} from "~/components/shared/RelTablePresets";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {PlaceableLink} from "~/lib/game-links.tsx";
import {gameText} from "~/lib/labels.ts";
import {ogImageForAsset} from "~/lib/og-meta";
import {fixFloat, readableSeconds} from "~/lib/utils";

export default function PavingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.PavingTileDesc);
    const index = BitCraftTables.PavingTileDesc.indexedBy("id");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");
    const placeableIdx = BitCraftTables.PlaceableDesc.indexedBy("id");

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

    const requiredByPlaceables = createMemo(() => {
        const t = tile();
        if (!t) return [];
        const placements = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
        const placeables: PlaceableDesc[] = [];
        for (const placement of placements) {
            if (placement.acceptablePavements?.includes(t.id)) {
                const placeable = placeableIdx().get(placement.placedPlaceableId);
                if (placeable) {
                    placeables.push(placeable);
                }
            }
        }
        return placeables;
    })

    return (
        <DetailPageLayout
            title={tile()?.name ?? `Paving Tile #${params.id}`}
            breadcrumbHref="/database/paving"
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
                {label: msg`Build Time`, value: tile() ? readableSeconds(fixFloat(tile()!.pavingDuration)) : undefined},
            ]}
            rawData={tile()}
            spacetimeTable={BitCraftTables.PavingTileDesc.spacetimeName}
            objectId={tile()?.id}
            tabs={[
                {
                    id: "consumed",
                    label: msg`Consumed Items`,
                    count: tile() ? tile()!.consumedItemStacks.length + (tile()!.inputCargoId > 0 ? 1 : 0) : 0,
                    showWhenEmpty: false,
                    content: () => <div class="flex flex-row flex-wrap justify-center gap-2">
                        <InputItemStackArray stacks={tile()!.consumedItemStacks}/>
                        <Show when={tile()!.inputCargoId}>
                            {c => <ItemStackArray stacks={[{itemId: c(), itemType: ItemType.Cargo as ItemType, quantity: 1, durability: undefined}]}/>}
                        </Show>
                    </div>,
                },
                {id: "knowledge", label: msg`Required Knowledge`, count: requiredKnowledges().length, showWhenEmpty: false, content: () => <KnowledgeTable data={requiredKnowledges()}/>},
                {id: "stats", label: msg`Stat Effects`, count: tile()?.statEffects?.length ?? 0, content: () => <StatTable data={tile()!.statEffects}/>},
                {
                    id: "placeables",
                    label: msg`Required to place`,
                    count: requiredByPlaceables().length,
                    showWhenEmpty: false,
                    content: () => {
                        return <RelTable<PlaceableDesc>
                            data={requiredByPlaceables()}
                            columns={[
                                {header: gameText(msg`Placaeable`), cell: plc => <PlaceableLink id={plc.id} name={plc.name}/>},
                                {header: gameText(msg`Tag`), cell: plc => plc.tag},
                                {header: gameText(msg`Tier`), cell: plc => plc.tier},
                            ]}
                        />
                    }
                },
                modelTab(() => tile() && {paths: [tile()!.prefabAddress], viewDirection: [0.25, 1, 0.35]}),
            ]}
        />
    );
}
