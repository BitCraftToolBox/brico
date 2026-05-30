/**
 * Placeable Graph Tool — Visualizes the full item→place→grow→interact lifecycle.
 *
 * Route: /tools/placeable-graph
 * URL params: ?placement=<id> for deep-linking from detail pages.
 *
 * Empty state: list of PlaceablePlacementDesc entries.
 * Graph state: SVG pan/zoom graph via BFS from selected placement.
 */

import {useNavigate, useSearchParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import MainLayout from "~/components/MainLayout";
import {PlaceableIcon} from "~/components/shared/GameIcon";
import {buildPlaceableGraph, PlaceableGraph} from "~/components/shared/PlaceableGraph";
import {breadcrumb} from "~/lib/game-links";
import {getPlaceableName} from "~/lib/placeables";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function PlaceableGraphTool() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const isLoading = useTablesLoading(
        BitCraftTables.PlaceableDesc,
        BitCraftTables.PlaceableGroupDesc,
        BitCraftTables.PlaceableGrowthDesc,
        BitCraftTables.PlaceableInteractionDesc,
        BitCraftTables.PlaceablePlacementDesc,
        BitCraftTables.ItemDesc,
        BitCraftTables.CargoDesc,
    );

    const placements = createMemo(() => {
        return BitCraftTables.PlaceablePlacementDesc.get() ?? [];
    });

    const selectedPlacementId = createMemo(() => {
        const p = searchParams.placement;
        if (!p) return undefined;
        const str = Array.isArray(p) ? p[0] : p;
        const id = parseInt(str, 10);
        return isNaN(id) ? undefined : id;
    });
    const selectedPlaceableName = createMemo(() => {
        if (!selectedPlacementId()) return undefined;
        const p = placements().find(pp => pp.id === selectedPlacementId());
        if (!p) return undefined;
        return getPlaceableName(p?.placedPlaceableId);
    })

    const graphData = createMemo(() => {
        const id = selectedPlacementId();
        if (!id) return null;
        return buildPlaceableGraph(id);
    });

    function selectPlacement(id: number) {
        setSearchParams({placement: String(id)});
    }

    function handlePlacementSwap(placementId: number) {
        selectPlacement(placementId);
    }

    const PLACEMENT_LOOP_NAMES = new Map<number, string>([
        [1110954448, "Sagi Bird Trapping"],
        [774931176, "Sagi Bird Domestication"],
        [2078563352, "Nubi Goat Trappping"],
        [2135187451, "Nubi Goat Domestication"],
    ]);
    function placementSelectionRow(placement: PlaceablePlacementDesc) {
        const loopName = PLACEMENT_LOOP_NAMES.get(placement.id);
        const placeable = BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(placement.placedPlaceableId);
        const placeableName = placeable?.name;
        return (
            <>
                <span class="font-medium"><div class="flex items-center gap-1"><Show when={placeable}><PlaceableIcon placeable={placeable!} small={true} noInteract/></Show> {loopName ?? placeableName}</div></span>
                <span class="text-xs text-muted-foreground ml-auto">{loopName ? placeableName : ""} #{placement.id}</span>
            </>
        );
    }

    return (
        <MainLayout title="Placeable Graph" navTitle={
            <>
                {breadcrumb("/database/placeable", "Placeables")}
                <span>Lifecycle Graph</span>
                <Show when={selectedPlaceableName()}>{(n) => {
                    return <>
                        <span class="mx-1.5">{">"}</span>
                        <span>{n()}</span>
                    </>;
                }}</Show>
            </>
        }>
            <Show when={!isLoading()} fallback={
                <div class="flex items-center justify-center py-20">
                    <Spinner type={SpinnerType.ballTriangle} class="mx-auto"/>
                </div>
            }>
                <div class="flex flex-col gap-4 px-4 pb-6 h-full">
                    <Show when={graphData()} fallback={
                        /* Empty state: list of placements */
                        <div class="max-w-2xl mx-auto w-full">
                            <div class="flex justify-center pb-4">
                                <h1 class="text-xl font-bold">Placeable Lifecycle Graph</h1>
                            </div>
                            <p class="text-sm text-muted-foreground mb-4">
                                Select a placement to visualize its lifecycle chain.
                            </p>
                            <div class="border rounded-md max-h-[70vh] overflow-auto">
                                <For each={placements()} fallback={
                                    <div class="text-center py-8 text-muted-foreground text-sm">No placements found</div>
                                }>
                                    {(p) => (
                                        <button
                                            class="w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors text-sm flex items-center gap-2"
                                            onClick={() => selectPlacement(p.id)}
                                        >
                                            {placementSelectionRow(p)}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                    }>
                        {(data) => (
                            <div class="flex flex-col flex-1 min-h-0 gap-2">
                                <Show when={selectedPlaceableName()}>
                                    {(n) => (
                                        <div class="flex justify-center">
                                            <h2 class="text-lg font-bold">{n()}</h2>
                                        </div>
                                    )}
                                </Show>
                                <div class="flex justify-center">
                                    <button
                                        class="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => setSearchParams({placement: undefined})}
                                    >
                                        ← Back to list
                                    </button>
                                </div>
                                <PlaceableGraph
                                    nodes={data().nodes}
                                    edges={data().edges}
                                    onNavigate={(href) => navigate(href)}
                                    onPlacementSelect={handlePlacementSwap}
                                />
                            </div>
                        )}
                    </Show>
                </div>
            </Show>
        </MainLayout>
    );
}

