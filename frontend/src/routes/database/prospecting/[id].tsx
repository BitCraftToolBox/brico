import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {EnemyIcon, ResourceIcon} from "~/components/shared/GameIcon";
import {ItemStackArray} from "~/components/shared/ItemStacks";
import {BiomeLink, SkillLinkById} from "~/lib/game-links";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, readableSeconds} from "~/lib/utils";

function ProspectingItemsPanel(props: { prospecting: ProspectingDesc }) {
    const requiredOnUse = createMemo(() => {
        if (!props.prospecting.requiredItemsToStart.length) return null;
        return (
            <div class="flex flex-col gap-2 align-items-center">
                <div class="text-center w-full h-10 text-sm"><Trans>Required to Start</Trans></div>
                <ItemStackArray stacks={props.prospecting.requiredItemsToStart}/>
            </div>
        );
    });
    const consumedOnUse = createMemo(() => {
        if (!props.prospecting.consumedItemsByAbilityTrigger.length) return null;
        return (
            <div class="flex flex-col gap-2 align-items-center">
                <div class="text-center w-full h-10 text-sm"><Trans>Consumed on Ability Use</Trans></div>
                <ItemStackArray stacks={props.prospecting.consumedItemsByAbilityTrigger}/>
            </div>
        );
    });
    const requiredForInteraction = createMemo(() => {
        if (!props.prospecting.requiredItemsToInteractWithReward.length) return null;
        return (
            <div class="flex flex-col gap-2 align-items-center">
                <div class="text-center w-full h-10 text-sm"><Trans>Required for Reward</Trans></div>
                <ItemStackArray stacks={props.prospecting.requiredItemsToInteractWithReward}/>
            </div>
        )
    });
    return <div class="flex flex-row flex-wrap gap-8 items-center justify-center">
        {requiredOnUse()}
        {consumedOnUse()}
        {requiredForInteraction()}
    </div>;
}

export default function ProspectingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.ProspectingDesc);
    const index = BitCraftTables.ProspectingDesc.indexedBy("id");
    const biomeIndex = BitCraftTables.BiomeDesc.indexedBy("biomeType", true);
    const enemyIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType");
    const enemyParamsIndex = BitCraftTables.EnemyAiParamsDesc.indexedBy("id");

    const prospecting = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const rangeStr = (arr: Array<number> | undefined) => {
        if (!arr || arr.length === 0) return undefined;
        if (arr.length >= 2 && arr[0] !== arr[arr.length - 1]) return `${arr[0]}–${arr[arr.length - 1]}`;
        return arr[0];
    }

    const biomes = createMemo(() => {
        const p = prospecting();
        if (!p?.biomeRequirements?.length) return [];
        const idx = biomeIndex();
        return p.biomeRequirements.map(id => idx.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
    });

    const experienceStr = createMemo(() => {
        const p = prospecting();
        if (!p?.experiencePerNode) return undefined;
        if (!p.experiencePerNode.quantity) return undefined;
        const exp = p.experiencePerNode;
        return () => <><SkillLinkById skillId={exp.skillId}/>: ${fixFloat(exp.quantity)}`</>;
    });

    const spawnInfo = createMemo(() => {
        const p = prospecting();
        if (!p) return undefined;
        if (p.resourceClumpId > 0) {
            const clumps = BitCraftTables.ResourceClumpDesc.indexedBy("id")();
            const resources = BitCraftTables.ResourceDesc.indexedBy("id")();
            const matched = clumps
                .get(p.resourceClumpId)?.resourceId?.map(rid => resources.get(rid))
                .filter((v): v is NonNullable<typeof v> => !!v);
            return {type: "resource" as const, items: matched ?? []};
        }
        if (p.enemyAiDescId > 0) {
            const enemyParams = enemyParamsIndex().get(p.enemyAiDescId);
            if (!enemyParams) return {type: "enemy" as const, items: []};
            const tagOrdinal = BitCraftTables.EnemyAiParamsDesc.tagToOrdinal("enemyType");
            const ordinal = tagOrdinal.get(enemyParams.enemyType.tag);
            const enemy = ordinal !== undefined ? enemyIndex().get(ordinal) : undefined;
            return {type: "enemy" as const, items: enemy ? [enemy] : []};
        }
        return undefined;
    });

    return (
        <DetailPageLayout
            title={prospecting()?.name ?? `Prospecting #${params.id}`}
            breadcrumbHref="/database/prospecting"
            loading={isLoading() && !prospecting()}
            name={prospecting()?.name ?? "Prospecting entry not found"}
            icon={<Show when={prospecting()?.iconAssetPath}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            description={prospecting()?.description}
            metaKind="prospecting node"
            metaImage={ogImageForCodepoint(prospecting()?.iconAssetPath)}
            details={[
                {label: msg`Breadcrumb Count`, value: rangeStr(prospecting()?.breadCrumbCount)},
                {label: msg`Contribution Per Crumb`, value: prospecting()?.contributionPerVisitedBreadCrumb},
                {label: msg`% Nodes for Max Contribution`, value: (prospecting()?.pctNodesForMaxContribution ?? 0) * 100},
                {label: msg`Single Contribution Only`, value: prospecting()?.singleContributionOnly},
                {label: msg`Breadcrumb Distance`, value: rangeStr(prospecting()?.distanceBetweenBreadCrumbs)},
                {label: msg`Breadcrumb Radius`, value: rangeStr(prospecting()?.breadCrumbRadius)},
                {label: msg`Deadzone Angle`, value: prospecting()?.deadzoneAngleBetweenCrumbs},
                {label: msg`Join Radius`, value: prospecting()?.joinRadius},
                {label: msg`Experience Per Node`, value: experienceStr()},
                {label: msg`Pointer Duration`, value: readableSeconds(prospecting()?.pointerDuration)},
                {label: msg`Prospecting Duration`, value: readableSeconds(prospecting()?.prospectingDuration)},
                {label: msg`Is Aquatic Resource`, value: prospecting()?.isAquaticResource},
                {label: msg`Allow Aquatic Prospecting`, value: prospecting()?.allowAquaticProspecting},
                {label: msg`Allow Aquatic Breadcrumb`, value: prospecting()?.allowAquaticBreadCrumb},
            ]}
            rawData={prospecting()}
            spacetimeTable={BitCraftTables.ProspectingDesc.spacetimeName}
            objectId={prospecting()?.id}
            tabs={[
                {
                    id: "biomes", label: msg`Biomes`, count: biomes().length,
                    content: () => (
                        <RelTable data={biomes()} columns={[
                            {
                                header: msg`Biome`,
                                cell: (biome) => <BiomeLink {...biome} />,
                            }
                        ]}/>
                    ),
                },
                {
                    id: "spawns", label: msg`Spawns`, count: spawnInfo()?.items.length ?? 0,
                    content: () => {
                        const info = spawnInfo()!;
                        if (info.type === "resource") {
                            return <For each={info.items}>
                                {res => <ResourceIcon res={res} alwaysLabel/>}
                            </For>;
                        }
                        return <For each={info.items}>
                            {enemy => <EnemyIcon enemy={enemy} alwaysLabel/>}
                        </For>;
                    },
                },
                {
                    id: "items",
                    label: msg`Required Items`,
                    count: (prospecting()?.requiredItemsToStart?.length ?? 0) +
                        (prospecting()?.requiredItemsToInteractWithReward.length ?? 0) +
                        (prospecting()?.consumedItemsByAbilityTrigger.length ?? 0),
                    showWhenEmpty: false,
                    content: () => <ProspectingItemsPanel prospecting={prospecting()!} />
                },
            ]}
        />
    );
}
