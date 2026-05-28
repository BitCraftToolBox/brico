import {useNavigate, useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {ExtractionRecipePanel, ResourceDepletionPanel} from "~/components/shared/RecipeDisplay";
import {breadcrumb} from "~/lib/game-links";
import {enemiesForResource, extractionRecipeForResource, resourcesYieldingResource} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

export default function ResourceDetail() {
    const params = useParams();
    const navigate = useNavigate();
    const isLoading = useTablesLoading(BitCraftTables.ResourceDesc);
    const resourceIndex = BitCraftTables.ResourceDesc.indexedBy("id");

    const resource = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return resourceIndex()?.get(id);
    });

    const extractionRecipe = createMemo(() => {
        const r = resource();
        if (!r) return undefined;
        return extractionRecipeForResource(r.id);
    });

    const enemies = createMemo(() => {
        const r = resource();
        if (!r) return [];
        return enemiesForResource(r);
    });

    const hasDepletion = createMemo(() => (resource()?.onDestroyYield?.length ?? 0) > 0);
    const hasDepletionResource = createMemo(() => (resource()?.onDestroyYieldResourceId ?? 0) > 0);
    const yieldedByResource = createMemo(() => resource() ? resourcesYieldingResource(resource()!.id) : [])

    return (
        <DetailPageLayout
            title={resource()?.name ?? `Resource #${params.id}`}
            breadcrumb={breadcrumb("/database/resource")}
            loading={isLoading() && !resource()}
            icon={<Show when={resource()}>{(r) =>
                <GameIcon name={r().name} iconAsset={r().iconAssetName} shape="square"
                          small={false} tier={r().tier} rarity={r().rarity} noInteract/>
            }</Show>}
            name={resource()?.name ?? "Resource not found"}
            tier={resource()?.tier}
            rarity={resource()?.rarity?.tag}
            description={resource()?.description}
            tag={resource()?.tag}
            details={[
                {label: "Max Health", value: resource()?.maxHealth},
                {label: "Flattenable", value: resource()?.flattenable ? true : undefined},
                {label: "Despawn Time", value: resource()?.despawnTime ? `${fixFloat(resource()!.despawnTime)}s` : undefined},
                {label: "Spawn Priority", value: resource()?.spawnPriority},
                {label: "Scheduled Respawn", value: resource()?.scheduledRespawnTime ? `${fixFloat(resource()!.scheduledRespawnTime)}s` : undefined},
                {label: "Not Respawning", value: resource()?.notRespawning ? true : undefined},
            ]}
            rawData={resource()}
            spacetimeTable={BitCraftTables.ResourceDesc.st_name}
            objectId={resource()?.id}
            chatLink={`(res=${resource()?.id})`}
            tabs={[
                {
                    id: "extraction",
                    label: "Extraction",
                    count: extractionRecipe() ? 1 : 0,
                    content: () => <Show when={extractionRecipe()}>
                        {(r) => <ExtractionRecipePanel recipe={r()}/>}
                    </Show>,
                },
                {
                    id: "depletion",
                    label: "Depletion Drops",
                    count: extractionRecipe() ? 0 : (resource()?.onDestroyYield?.length ?? 0) + (resource()?.onDestroyYieldResourceId ? 1 : 0),
                    showWhenEmpty: false,
                    content: () => <Show when={resource() && (hasDepletion() || hasDepletionResource())}>
                        {<ResourceDepletionPanel resource={resource()!}/>}
                    </Show>,
                },
                {
                    id: "from-depletion",
                    label: "Spawned from Resource",
                    count: yieldedByResource()?.length ?? 0,
                    showWhenEmpty: false,
                    content: () => (
                        <div class="flex flex-col gap-4">
                            <For each={yieldedByResource()}>
                                {r => <ResourceDepletionPanel resource={r}/>}
                            </For>
                        </div>
                    )
                },
                {
                    id: "enemies",
                    label: "Spawns Enemies",
                    count: enemies().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<EnemyDesc>
                            data={enemies()}
                            columns={[
                                {header: "Name", cell: (row) => <span>{row.name}</span>},
                                {header: "Tier", cell: (row) => <span>{row.tier}</span>},
                                {header: "Max HP", cell: (row) => <span>{row.maxHealth}</span>},
                            ]}
                            onRowClick={(row) => navigate(`/database/creature/${row.enemyType}`)}
                        />
                    ),
                },
            ]}
        />
    );
}

