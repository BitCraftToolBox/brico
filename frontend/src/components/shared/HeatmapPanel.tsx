import {useColorMode} from "@kobalte/core";
import {MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineExternalLink as IconExternal} from "solid-icons/tb";
import {Component, createEffect, createSignal, onCleanup, onMount, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {MAP_EMBED_SERVER} from "~/lib/constants";
import {HeatmapPoint} from "~/lib/heatmap-data";
import {hexColorToNumber, HexMapInstance, loadHexMapSdk} from "~/lib/hexmap-sdk";

export interface HeatmapLayerInput {
    id: string;
    label?: string;
    color: string;
    points: HeatmapPoint[];
}

function drawLayers(map: HexMapInstance, layers: HeatmapLayerInput[]) {
    map.clearLayers();
    for (const layer of layers) {
        if (!layer.points.length) continue;
        map.createLayer(layer.id, {label: layer.label ?? layer.id});
        map.addHeatmap({
            layer: layer.id,
            points: layer.points,
            color: hexColorToNumber(layer.color),
            radius: Math.min(500, Math.max(80, 100_000 / layer.points.length)),
        });
    }
}

/** Generic embed of a HexMap instance rendering one or more colored heatmap layers. */
const HexMapEmbed: Component<{ layers: HeatmapLayerInput[]; class?: string }> = (props) => {
    let containerRef: HTMLDivElement | undefined;
    const [map, setMap] = createSignal<HexMapInstance>();
    const {colorMode} = useColorMode();

    onMount(() => {
        let cancelled = false;

        loadHexMapSdk().then(HexMap => {
            if (cancelled || !containerRef) return;
            const instance = HexMap.create(containerRef, {
                server: MAP_EMBED_SERVER,
                theme: colorMode() === "dark" ? "dark" : "light",
                builtinPacks: "none",
                showMinimap: false,
            });
            instance.whenReady().then(() => {
                if (cancelled) return;
                setMap(instance);
            });
        }).catch(() => {
            // no-op: parent shows the fallback link regardless of map load success
        });

        onCleanup(() => {
            cancelled = true;
            map()?.destroy();
        });
    });

    createEffect(() => {
        const instance = map();
        if (!instance) return;
        drawLayers(instance, props.layers);
    });

    return <div ref={containerRef} class={props.class}/>;
};

export interface HeatmapTabProps {
    /** One heatmap layer per data source (e.g. one resource, or one per herd type for a creature). */
    layers: HeatmapLayerInput[];
    /** bitcraftmap.com deep link, always shown at the bottom of the tab. */
    mapUrl: string;
    loading?: boolean;
    /** When set, always shows the fallback message instead of the map (e.g. no fixed spawn locations). */
    disabledReason?: MessageDescriptor;
}

/** Detail-page tab content: an embedded HexMap heatmap, or a fallback message, plus a bitcraftmap.com link. */
export const HeatmapTab: Component<HeatmapTabProps> = (props) => {
    const activeLayers = () => props.layers.filter(l => l.points.length > 0);
    const hasMap = () => !props.disabledReason && activeLayers().length > 0;
    const {_} = useLingui();

    return (
        <div class="flex flex-col gap-3">
            <a
                href={props.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors self-center"
            >
                <Trans>View live map on bitcraftmap.com</Trans> <IconExternal/>
            </a>
            <Show when={!props.loading} fallback={
                <div class="flex items-center justify-center py-16">
                    <Spinner type={SpinnerType.ballTriangle}/>
                </div>
            }>
                <Show when={hasMap()} fallback={
                    <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {_(props.disabledReason ?? msg`No map data available for this entry.`)}
                    </div>
                }>
                    <HexMapEmbed layers={activeLayers()} class="w-full h-[500px] rounded-md overflow-hidden border"/>
                    <div class="text-sm text-muted-foreground self-center">
                        <Trans>Heatmap data is approximate. View the live map for exact locations.</Trans>
                    </div>
                </Show>
            </Show>
        </div>
    );
};
