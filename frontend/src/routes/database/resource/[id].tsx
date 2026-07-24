import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {useParams} from "@solidjs/router";
import {createMemo, createResource, For, Show} from "solid-js";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {lootTab} from "~/components/fun/BricoLootBox";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ResourceIcon} from "~/components/shared/GameIcon";
import {HeatmapTab} from "~/components/shared/HeatmapPanel";
import {ExtractionRecipePanel, RecipeSelect, ResourceDepletionPanel, ResourceGrowthPanel} from "~/components/shared/RecipeDisplay";
import {IconLink, pageIcon} from "~/lib/game-links";
import {fetchHeatmapPoints, resourceHeatmapPath} from "~/lib/heatmap-data";
import {ogImageForAsset} from "~/lib/og-meta";
import {prospectingForResource} from "~/lib/recipe-sources";
import {enemiesForResource, extractionRecipeForResource, resourceGrowthFrom, resourceGrowthInto, resourcesYieldingResource} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {spawnedByProspectingTab} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat} from "~/lib/utils";

export default function ResourceDetail() {
    const params = useParams();
    const { easterEggs } = useSettings();
    const isLoading = useTablesLoading(BitCraftTables.ResourceDesc);
    const resourceIndex = BitCraftTables.ResourceDesc.indexedBy("id");

    const resource = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return resourceIndex().get(id);
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

    const prospecting = createMemo(() => {
       const r = resource();
       if (!r) return [];
       return prospectingForResource(r.id);
    });

    const [heatmapPoints] = createResource(() => resource()?.id, (id) => fetchHeatmapPoints(resourceHeatmapPath(id)));

    const hasDepletion = createMemo(() => (resource()?.onDestroyYield?.length ?? 0) > 0);
    const hasDepletionResource = createMemo(() => (resource()?.onDestroyYieldResourceId ?? 0) > 0);
    const yieldedByResource = createMemo(() => resource() ? resourcesYieldingResource(resource()!.id) : [])

    const growthInto = createMemo(() => resource() ? resourceGrowthInto(resource()!.id) : undefined);
    const growthFrom = createMemo(() => {
        const r = resource();
        if (!r) return undefined;
        const descs = resourceGrowthFrom(r.id);
        return descs?.sort((a, b) => a.time[0] - b.time[0])
    });

    const details = createMemo(() => {
        const r = resource();
        if (!r) return undefined;
        return [
            {
                properties: [
                    {label: msg`Max Health`, value: r.maxHealth},
                    {label: msg`Ignores Damage`, value: r.ignoreDamage ? true : undefined},
                    {label: msg`Show Time Left`, value: r.showTimeLeft ? true : undefined},
                    {label: msg`Flattenable`, value: r.flattenable ? true : undefined},
                    {label: msg`Compendium Entry`, value: !r.compendiumEntry ? false : undefined},
                ]
            },
            {
                heading: msg`Resource Spawning`,
                properties: [
                    {label: msg`Despawn Time`, value: r.despawnTime ? `${fixFloat(r.despawnTime)}s` : undefined},
                    {label: msg`Scheduled Respawn`, value: r.scheduledRespawnTime ? `${fixFloat(r.scheduledRespawnTime)}s` : undefined},
                    {label: msg`Not Respawning`, value: r.notRespawning ? true : undefined},
                    {label: msg`Spawn Priority`, value: r.spawnPriority},
                    ...(r.spawnsOnLand ? [{label: msg`Land Elevation`, value: `${r.landElevationMin}-${r.landElevationMax}`}] : []),
                    ...(r.spawnsInWater ? [{label: msg`Water Depth`, value: `${r.waterDepthMin}-${r.waterDepthMax}`}] : []),
                ]
            }
        ]
    });

    return (
        <DetailPageLayout
            title={resource()?.name ?? `Resource #${params.id}`}
            breadcrumbHref="/database/resource"
            loading={isLoading() && !resource()}
            icon={<Show when={resource()}>{r =>
                <ResourceIcon res={r()} small={false} noInteract/>
            }</Show>}
            name={resource()?.name ?? "Resource not found"}
            tier={resource()?.tier}
            rarity={resource()?.rarity?.tag}
            description={resource()?.description}
            tag={resource()?.tag}
            metaKind="resource"
            metaImage={ogImageForAsset(resource()?.iconAssetName)}
            details={details()}
            rawData={resource()}
            spacetimeTable={BitCraftTables.ResourceDesc.spacetimeName}
            objectId={resource()?.id}
            chatLink={`(res=${resource()?.id})`}
            tabs={[
                {
                    id: "extraction",
                    label: msg`Extraction`,
                    count: extractionRecipe() ? 1 : 0,
                    content: () => <Show when={extractionRecipe()}>
                        {r => <ExtractionRecipePanel recipe={r()}/>}
                    </Show>,
                },
                {
                    id: "depletion",
                    label: msg`Depletion Drops`,
                    count: extractionRecipe() ? 0 : (resource()?.onDestroyYield?.length ?? 0) + (resource()?.onDestroyYieldResourceId ? 1 : 0),
                    showWhenEmpty: false,
                    content: () => <Show when={resource() && (hasDepletion() || hasDepletionResource())}>
                        <ResourceDepletionPanel resource={resource()!}/>
                    </Show>,
                },
                {
                    id: "from-depletion",
                    label: msg`Spawned from Resource`,
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
                  id: "growth",
                  label: msg`Timed Growth`,
                  count: (growthFrom() ? 1 : 0) + (growthInto() ? 1 : 0),
                  showWhenEmpty: false,
                  content: () => (
                      <div class="space-y-4">
                          <Show when={growthFrom()}>{growthDescs =>
                              <div>
                                  <h4 class="text-sm text-muted-foreground mb-2"><Trans>Grows From</Trans></h4>
                                  <RecipeSelect
                                      recipes={growthDescs()}
                                      nameFor={gd => resourceIndex().get(gd.resourceId)?.name ?? "Resource #" + gd.resourceId}
                                      render={gd => <ResourceGrowthPanel growth={gd}/>}
                                  />
                              </div>
                          }</Show>
                          <Show when={growthInto()}>{growthDesc =>
                              <div>
                                  <h4 class="text-sm text-muted-foreground mb-2"><Trans>Grows Into</Trans></h4>
                                  <ResourceGrowthPanel growth={growthDesc()}/>
                              </div>
                          }</Show>
                      </div>
                  )
                },
                spawnedByProspectingTab(prospecting()),
                {
                    id: "enemies",
                    label: msg`Spawns Enemies`,
                    count: enemies().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<EnemyDesc>
                            data={enemies()}
                            columns={[
                                {header: msg`Name`, cell: (row) => (
                                    <IconLink href={`/database/creature/${row.enemyType}`} icon={pageIcon("Creatures")}>
                                        {row.name}
                                    </IconLink>
                                )},
                                {header: msg`Tier`, cell: (row) => <span>{row.tier}</span>},
                                {header: msg`Max HP`, cell: (row) => <span>{row.maxHealth}</span>},
                            ]}
                        />
                    ),
                },
                {
                    id: "map",
                    label: msg`Map`,
                    content: () => (
                        <HeatmapTab
                            loading={heatmapPoints.loading}
                            disabledReason={prospecting().length > 0
                                ? msg`This resource is found via prospecting and doesn't have fixed spawn locations to show on a map.`
                                : undefined}
                            layers={[{
                                id: "resource",
                                label: resource()?.name,
                                color: resource()?.spawnsInWater ? "#F050B0" : "#50B0F0",
                                points: heatmapPoints() ?? [],
                            }]}
                            mapUrl={`https://bitcraftmap.com/?resourceId=${resource()?.id}`}
                        />
                    ),
                },
                ...(resource()?.id === 1702339460 && easterEggs() ? [lootTab()] : [])
            ]}
        />
    );
}

