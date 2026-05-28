import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelationshipTab} from "~/components/shared/DetailPageLayout";
import {PlaceableIcon} from "~/components/shared/GameIcon";
import {GrowthPanel, InteractionPanel, PlacementPanel, RecipeSelect} from "~/components/shared/RecipeDisplay";
import {breadcrumb} from "~/lib/game-links";
import {
    findRootPlacement,
    getInteractionName,
    getPlaceableName,
    getPlacementName,
    useGroupsByPlaceable,
    useGrowthByOutcome,
    useGrowthByPlaceable,
    useInteractionsByPlaceable,
    usePlacementsByPlaceable,
} from "~/lib/placeables";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function PlaceableDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(
        BitCraftTables.PlaceableDesc,
        BitCraftTables.PlaceableGroupDesc,
        BitCraftTables.PlaceableGrowthDesc,
        BitCraftTables.PlaceableInteractionDesc,
        BitCraftTables.PlaceablePlacementDesc,
    );
    const placeableIndex = BitCraftTables.PlaceableDesc.indexedBy("id");

    const placeable = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return placeableIndex()?.get(id);
    });

    const placeableId = () => placeable()?.id;

    // Lookups
    const groupsMap = useGroupsByPlaceable();
    const placementsMap = usePlacementsByPlaceable();
    const growthMap = useGrowthByPlaceable();
    const growthByOutcomeMap = useGrowthByOutcome();
    const interactionsMap = useInteractionsByPlaceable();

    const groups = createMemo(() => placeableId() != null ? groupsMap()?.get(placeableId()!) ?? [] : []);
    const placements = createMemo(() => placeableId() != null ? placementsMap()?.get(placeableId()!) ?? [] : []);
    const growth = createMemo(() => placeableId() != null ? growthMap()?.get(placeableId()!) : undefined);
    const growthSources = createMemo(() => placeableId() != null ? growthByOutcomeMap()?.get(placeableId()!) ?? [] : []);
    const interactions = createMemo(() => placeableId() != null ? interactionsMap()?.get(placeableId()!) ?? [] : []);

    // Root placement (for "View in Graph" link)
    const rootPlacement = createMemo(() => placeableId() != null ? findRootPlacement(placeableId()!) : undefined);
    const directPlacement = createMemo(() => placements().length > 0 ? placements()[0] : undefined);
    const graphPlacementId = createMemo(() => directPlacement()?.id ?? rootPlacement()?.id);

    const detailGroups = createMemo((): DetailGroup[] => {
        const p = placeable();
        if (!p) return [];
        const result: DetailGroup[] = [];

        // General details
        result.push({
            properties: [
                {label: "Max Health", value: p.maxHealth},
                {label: "Visible to Others", value: p.visibleToOthers},
            ],
        });

        // Placement group info
        const grps = groups();
        if (grps.length) {
            for (const g of grps) {
                result.push({
                    heading: "Placement Group",
                    properties: [
                        {label: "Group", value: g.name},
                        {label: "Limit", value: g.placementLimit},
                    ],
                });
            }
        }

        return result;
    });

    // Relationship tabs (Placement, Interactions, Growth)
    const tabs = createMemo((): RelationshipTab[] => {
        if (!placeable()) return [];
        const result: RelationshipTab[] = [];

        const pl = placements();
        if (pl.length) {
            result.push({
                id: "placement",
                label: "Placement",
                count: pl.length,
                content: () => (
                    <RecipeSelect
                        recipes={pl}
                        nameFor={getPlacementName}
                        render={p => <PlacementPanel placement={p}/>}
                    />
                ),
            });
        }

        const ia = interactions();
        if (ia.length) {
            result.push({
                id: "interactions",
                label: "Interactions",
                count: ia.length,
                content: () => (
                    <RecipeSelect
                        recipes={ia}
                        nameFor={getInteractionName}
                        render={i => <InteractionPanel interaction={i}/>}
                    />
                ),
            });
        }

        const g = growth();
        if (g) {
            result.push({
                id: "grows-into",
                label: "Grows into",
                count: g.outcomes.length,
                content: () => <GrowthPanel growth={g}/>,
            });
        }

        const gs = growthSources();
        if (gs.length) {
            result.push({
                id: "grows-from",
                label: "Grows from",
                count: gs.length,
                content: () => (
                    <RecipeSelect
                        recipes={gs}
                        nameFor={g => getPlaceableName(g.placeableId)}
                        render={g => <GrowthPanel growth={g}/>}
                    />
                ),
            });
        }

        return result;
    });

    return (
        <DetailPageLayout
            title={placeable()?.name ?? `Placeable #${params.id}`}
            breadcrumb={breadcrumb("/database/placeable")}
            loading={isLoading() && !placeable()}
            icon={<Show when={placeable()}>{p =>
                <PlaceableIcon placeable={p()} small={false} noInteract/>
            }</Show>}
            name={placeable()?.name ?? `Placeable #${params.id}`}
            tier={placeable()?.tier}
            rarity={placeable()?.rarity?.tag}
            tag={placeable()?.tag}
            description={placeable()?.description}
            details={detailGroups()}
            summaryContent={graphPlacementId() ? () => (
                <div class="flex flex-col items-center gap-2 py-2">
                    <p class="text-sm text-muted-foreground">This placeable is part of a lifecycle chain.</p>
                    <A href={`/tools/placeable-graph?placement=${graphPlacementId()}`}
                       class="text-sm font-medium hover:underline">
                        View full lifecycle in Placeable Graph →
                    </A>
                </div>
            ) : undefined}
            rawData={placeable()}
            spacetimeTable={BitCraftTables.PlaceableDesc.st_name}
            objectId={placeable()?.id}
            tabs={tabs()}
        />
    );
}

