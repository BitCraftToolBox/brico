import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelationshipTab} from "~/components/shared/DetailPageLayout";
import {PlaceableIcon} from "~/components/shared/GameIcon";
import {ExtractionRecipePanel, GrowthPanel, PlacementPanel, RecipeSelect} from "~/components/shared/RecipeDisplay";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {ogImageForAsset} from "~/lib/og-meta";
import {
    extractionsByPlaceable,
    findRootPlacement,
    getPlaceableName,
    getPlacementName,
    groupsByPlaceable,
    growthByOutcome,
    growthByPlaceable,
    interactionsByOutcome,
    interactionsByPlaceable,
    placementsByPlaceable,
} from "~/lib/placeables";
import {getExtractionRecipeName} from "~/lib/relations";
import {placeableGraphTab, placeableInteractionsCombinedTab} from "~/lib/table-utils/detail-tab-builders";

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
        return placeableIndex().get(id);
    });

    const placeableId = () => placeable()?.id;

    // Lookups — shared module-scope accessors, see ~/lib/placeables
    const groups = createMemo(() => placeableId() != null ? groupsByPlaceable().get(placeableId()!) ?? [] : []);
    const placements = createMemo(() => placeableId() != null ? placementsByPlaceable().get(placeableId()!) ?? [] : []);
    const growth = createMemo(() => placeableId() != null ? growthByPlaceable().get(placeableId()!) : undefined);
    const growthSources = createMemo(() => placeableId() != null ? growthByOutcome().get(placeableId()!) ?? [] : []);
    const interactionsWith = createMemo(() => placeableId() != null ? interactionsByPlaceable().get(placeableId()!) ?? [] : []);
    const interactionsResultingIn = createMemo(() => placeableId() != null ? interactionsByOutcome().get(placeableId()!) ?? [] : []);
    const extractions = createMemo(() => placeableId() != null ? extractionsByPlaceable().get(placeableId()!) ?? [] : []);

    // Root placement (for "View in Graph" link)
    const rootPlacement = createMemo(() => placeableId() != null ? findRootPlacement(placeableId()!) : undefined);
    const directPlacement = createMemo(() => placements().length > 0 ? placements()[0] : undefined);
    const graphPlacement = createMemo(() => directPlacement() ?? rootPlacement());

    const detailGroups = createMemo((): DetailGroup[] => {
        const p = placeable();
        if (!p) return [];
        const result: DetailGroup[] = [];

        // General details
        result.push({
            properties: [
                {label: msg`Max Health`, value: p.maxHealth},
                {label: msg`Visible to Others`, value: p.visibleToOthers},
            ],
        });

        // Placement group info
        const grps = groups();
        if (grps.length) {
            for (const g of grps) {
                result.push({
                    heading: msg`Placement Group`,
                    properties: [
                        {label: msg`Group`, value: g.name},
                        {label: msg`Limit`, value: g.placementLimit},
                    ],
                });
            }
        }

        result.push({
            heading: msg`Spawn Conditions`,
            properties: [
                ...(p.spawnsOnLand ? [{label: msg`Land Elevation`, value: `${p.landElevationMin}-${p.landElevationMax}`}] : []),
                ...(p.spawnsInWater ? [{label: msg`Water Depth`, value: `${p.waterDepthMin}-${p.waterDepthMax}`}] : []),
            ]
        })

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
                label: msg`Placement`,
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

        const iaWith = interactionsWith();
        const iaResultingIn = interactionsResultingIn();
        if (iaWith.length || iaResultingIn.length) {
            result.push(placeableInteractionsCombinedTab(iaWith, iaResultingIn));
        }

        const ext = extractions();
        if (ext.length) {
            result.push({
                id: "extracted-from",
                label: msg`Extracted from`,
                count: ext.length,
                content: () => (
                    <RecipeSelect
                        recipes={ext}
                        nameFor={getExtractionRecipeName}
                        render={e => <ExtractionRecipePanel recipe={e}/> }
                    />
                )
            })
        }

        const g = growth();
        if (g) {
            result.push({
                id: "grows-into",
                label: msg`Grows into`,
                count: g.outcomesV2?.length ?? 0,
                content: () => <GrowthPanel growth={g}/>,
            });
        }

        const gs = growthSources();
        if (gs.length) {
            result.push({
                id: "grows-from",
                label: msg`Grows from`,
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

        const placement = graphPlacement();
        if (placement) {
            result.push(placeableGraphTab(placement));
        }

        return result;
    });

    return (
        <DetailPageLayout
            title={placeable()?.name ?? `Placeable #${params.id}`}
            breadcrumbHref="/database/placeable"
            loading={isLoading() && !placeable()}
            icon={<Show when={placeable()}>{p =>
                <PlaceableIcon placeable={p()} small={false} noInteract/>
            }</Show>}
            name={placeable()?.name ?? `Placeable #${params.id}`}
            tier={placeable()?.tier}
            rarity={placeable()?.rarity?.tag}
            tag={placeable()?.tag}
            description={placeable()?.description}
            metaKind="placeable"
            metaImage={ogImageForAsset(placeable()?.iconAssetName)}
            details={detailGroups()}
            rawData={placeable()}
            spacetimeTable={BitCraftTables.PlaceableDesc.spacetimeName}
            objectId={placeable()?.id}
            tabs={tabs()}
        />
    );
}

