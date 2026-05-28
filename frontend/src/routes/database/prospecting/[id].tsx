import {useNavigate, useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {TierIcon} from "~/components/shared/GameIcon";
import {ItemStackTable} from "~/components/shared/RelTablePresets";
import {breadcrumb} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, readableSeconds} from "~/lib/utils";

export default function ProspectingDetail() {
    const params = useParams();
    const navigate = useNavigate();
    const isLoading = useTablesLoading(BitCraftTables.ProspectingDesc);
    const index = BitCraftTables.ProspectingDesc.indexedBy("id");
    const biomeIndex = BitCraftTables.BiomeDesc.indexedBy("biomeType");
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");
    const enemyIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType");
    const enemyParamsIndex = BitCraftTables.EnemyAiParamsDesc.indexedBy("id");

    const prospecting = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const breadCrumbCount = createMemo(() => {
        const arr = prospecting()?.breadCrumbCount;
        if (!arr || arr.length === 0) return "—";
        if (arr.length >= 2 && arr[0] !== arr[arr.length - 1]) return `${prospecting()!.breadCrumbCount[0]}–${prospecting()!.breadCrumbCount[prospecting()!.breadCrumbCount.length - 1]}`;
        return arr[0];
    });

    const biomes = createMemo(() => {
        const p = prospecting();
        if (!p?.biomeRequirements?.length) return [];
        const idx = biomeIndex();
        if (!idx) return [];
        return p.biomeRequirements.map(id => idx.get(id)).filter(Boolean) as any[];
    });

    const experienceStr = createMemo(() => {
        const p = prospecting();
        if (!p?.experiencePerNode) return undefined;
        if (!p.experiencePerNode.quantity) return undefined;
        const name = skillIndex()?.get(p.experiencePerNode.skillId)?.name ?? `Skill ${p.experiencePerNode.skillId}`;
        return `${name}: ${fixFloat(p.experiencePerNode.quantity)}`;
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
            const enemyParams = enemyParamsIndex()?.get(p.enemyAiDescId);
            if (!enemyParams) return {type: "enemy" as const, items: []};
            const tagOrdinal = BitCraftTables.EnemyAiParamsDesc.tagToOrdinal("enemyType");
            const ordinal = tagOrdinal.get(enemyParams.enemyType.tag);
            const enemy = ordinal !== undefined ? enemyIndex()?.get(ordinal) : undefined;
            return {type: "enemy" as const, items: enemy ? [enemy] : []};
        }
        return undefined;
    });

    return (
        <DetailPageLayout
            title={prospecting()?.name ?? `Prospecting #${params.id}`}
            breadcrumb={breadcrumb("/database/prospecting")}
            loading={isLoading() && !prospecting()}
            name={prospecting()?.name ?? "Prospecting entry not found"}
            description={prospecting()?.description}
            details={[
                {label: "Breadcrumb Count", value: breadCrumbCount()},
                {label: "Contribution Per Crumb", value: prospecting()?.contributionPerVisitedBreadCrumb},
                {label: "% Nodes for Max Contribution", value: (prospecting()?.pctNodesForMaxContribution ?? 0) * 100},
                {label: "Experience Per Node", value: experienceStr()},
                {label: "Deadzone Angle", value: prospecting()?.deadzoneAngleBetweenCrumbs},
                {label: "Join Radius", value: prospecting()!.joinRadius},
                {label: "Pointer Duration", value: readableSeconds(prospecting()?.pointerDuration)},
                {label: "Prospecting Duration", value: readableSeconds(prospecting()?.prospectingDuration)},
                {label: "Is Aquatic Resource", value: prospecting()?.isAquaticResource},
                {label: "Allow Aquatic Prospecting", value: prospecting()?.allowAquaticProspecting},
                {label: "Allow Aquatic Breadcrumb", value: prospecting()?.allowAquaticBreadCrumb},
            ]}
            rawData={prospecting()}
            spacetimeTable={BitCraftTables.ProspectingDesc.st_name}
            objectId={prospecting()?.id}
            tabs={[
                {
                    id: "spawns", label: "Spawns", count: spawnInfo()?.items.length ?? 0,
                    content: () => {
                        const info = spawnInfo()!;
                        if (info.type === "resource") {
                            return <RelTable data={info.items} columns={[
                                {header: "Resource", cell: (row: any) => <span>{row.name}</span>},
                                {header: "Tier", cell: (row: any) => <span><TierIcon tier={row.tier}/></span>},
                            ]} onRowClick={(row: any) => navigate(`/database/resource/${row.id}`)}/>;
                        }
                        return <RelTable data={info.items} columns={[
                            {header: "Enemy", cell: (row: any) => <span>{row.name}</span>},
                            {header: "Tier", cell: (row: any) => <span>{row.tier}</span>},
                        ]} onRowClick={(row: any) => navigate(`/database/creature/${row.enemyType}`)}/>;
                    },
                },
                {
                    id: "biomes", label: "Biomes", count: biomes().length,
                    content: () => <RelTable data={biomes()} columns={[{header: "Biome", cell: (row: any) => <span>{row.name}</span>}]}
                                             onRowClick={(row: any) => navigate(`/database/biome/${row.biomeType}`)}/>,
                },
                {
                    id: "start-items",
                    label: "Required Start Items",
                    count: prospecting()?.requiredItemsToStart?.length ?? 0,
                    content: () => <ItemStackTable data={prospecting()!.requiredItemsToStart}/>
                },
                {
                    id: "interact-items",
                    label: "Required Interact Items",
                    count: prospecting()?.requiredItemsToInteractWithReward?.length ?? 0,
                    content: () => <ItemStackTable data={prospecting()!.requiredItemsToInteractWithReward}/>
                },
                {
                    id: "consumed-items",
                    label: "Consumed Items",
                    count: prospecting()?.consumedItemsByAbilityTrigger?.length ?? 0,
                    content: () => <ItemStackTable data={prospecting()!.consumedItemsByAbilityTrigger}/>
                },
            ]}
        />
    );
}
