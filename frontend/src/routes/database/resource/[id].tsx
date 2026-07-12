import {useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {EnemyDesc} from "~/bindings/src/enemy_desc_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {lootTab} from "~/components/fun/BricoLootBox";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ResourceIcon} from "~/components/shared/GameIcon";
import {ExtractionRecipePanel, RecipeSelect, ResourceDepletionPanel, ResourceGrowthPanel} from "~/components/shared/RecipeDisplay";
import {breadcrumb, IconLink, pageIcon} from "~/lib/game-links";
import {ogImageForAsset} from "~/lib/og-meta";
import {prospectingForResource} from "~/lib/recipe-sources";
import {enemiesForResource, extractionRecipeForResource, resourceGrowthFrom, resourceGrowthInto, resourcesYieldingResource} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
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

    return (
        <DetailPageLayout
            title={resource()?.name ?? `Resource #${params.id}`}
            breadcrumb={breadcrumb("/database/resource")}
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
            details={[
                {label: "Max Health", value: resource()?.maxHealth},
                {label: "Ignores Damage", value: resource()?.ignoreDamage ? true : undefined},
                {label: "Show Time Left", value: resource()?.showTimeLeft ? true : undefined},
                {label: "Despawn Time", value: resource()?.despawnTime ? `${fixFloat(resource()!.despawnTime)}s` : undefined},
                {label: "Scheduled Respawn", value: resource()?.scheduledRespawnTime ? `${fixFloat(resource()!.scheduledRespawnTime)}s` : undefined},
                {label: "Not Respawning", value: resource()?.notRespawning ? true : undefined},
                {label: "Flattenable", value: resource()?.flattenable ? true : undefined},
                {label: "Spawn Priority", value: resource()?.spawnPriority},
                {label: "Compendium Entry", value: !resource()?.compendiumEntry ? false : undefined},
            ]}
            rawData={resource()}
            spacetimeTable={BitCraftTables.ResourceDesc.spacetimeName}
            objectId={resource()?.id}
            chatLink={`(res=${resource()?.id})`}
            tabs={[
                {
                    id: "extraction",
                    label: "Extraction",
                    count: extractionRecipe() ? 1 : 0,
                    content: () => <Show when={extractionRecipe()}>
                        {r => <ExtractionRecipePanel recipe={r()}/>}
                    </Show>,
                },
                {
                    id: "depletion",
                    label: "Depletion Drops",
                    count: extractionRecipe() ? 0 : (resource()?.onDestroyYield?.length ?? 0) + (resource()?.onDestroyYieldResourceId ? 1 : 0),
                    showWhenEmpty: false,
                    content: () => <Show when={resource() && (hasDepletion() || hasDepletionResource())}>
                        <ResourceDepletionPanel resource={resource()!}/>
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
                  id: "growth",
                  label: "Timed Growth",
                  count: (growthFrom() ? 1 : 0) + (growthInto() ? 1 : 0),
                  showWhenEmpty: false,
                  content: () => (
                      <div class="space-y-4">
                          <Show when={growthFrom()}>{growthDescs =>
                              <div>
                                  <h4 class="text-sm text-muted-foreground mb-2">Grows From</h4>
                                  <RecipeSelect
                                      recipes={growthDescs()}
                                      nameFor={gd => resourceIndex().get(gd.resourceId)?.name ?? "Resource #" + gd.resourceId}
                                      render={gd => <ResourceGrowthPanel growth={gd}/>}
                                  />
                              </div>
                          }</Show>
                          <Show when={growthInto()}>{growthDesc =>
                              <div>
                                  <h4 class="text-sm text-muted-foreground mb-2">Grows Into</h4>
                                  <ResourceGrowthPanel growth={growthDesc()}/>
                              </div>
                          }</Show>
                      </div>
                  )
                },
                {
                    id: "prospecting",
                    label: "Spawned from Prospecting",
                    count: prospecting().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<ProspectingDesc>
                            data={prospecting()}
                            columns={[
                                {header: "Name", cell: (row) => (
                                    <IconLink href={`/database/prospecting/${row.id}`} icon={<FontIcon codepoint={row.iconAssetPath} class="size-4 inline"/>}>
                                        {row.name}
                                    </IconLink>
                                )},
                                {header: "Description", cell: (row) => <span class="text-muted-foreground text-xs">{row.description}</span>},
                            ]}
                        />
                    ),
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
                                {header: "Name", cell: (row) => (
                                    <IconLink href={`/database/creature/${row.enemyType}`} icon={pageIcon("Creatures")}>
                                        {row.name}
                                    </IconLink>
                                )},
                                {header: "Tier", cell: (row) => <span>{row.tier}</span>},
                                {header: "Max HP", cell: (row) => <span>{row.maxHealth}</span>},
                            ]}
                        />
                    ),
                },
                ...(resource()?.id === 1702339460 && easterEggs() ? [lootTab()] : [])
            ]}
        />
    );
}

