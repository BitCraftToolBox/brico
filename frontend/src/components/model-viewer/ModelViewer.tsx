/**
 * ModelViewer — renders a list of glb parts (one model, or a composed character) with orbit/pan/zoom.
 * `parts` and `tints` are tracked: pass memoized values and change them to update the scene.
 * The camera is re-fitted only when `frameKey` changes, so swapping a part keeps the user's view.
 */

import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {TbOutlineInfoCircle as IconInfo} from "solid-icons/tb";
import {createEffect, createSignal, onCleanup, onMount, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import type {ModelStage} from "~/components/model-viewer/engine";
import type {ModelPart, ModelTints} from "~/lib/models";
import {cn} from "~/lib/utils";

export interface ModelViewerProps {
    parts: ModelPart[];
    tints?: ModelTints;
    frameKey?: string;
    /** Camera direction from the model when fitting; defaults to a three-quarter view. */
    viewDirection?: [number, number, number];
    class?: string;
    /** Receives the controls for the viewer (see `ModelViewerHandle`) once, when the component is created. */
    handle?: (handle: ModelViewerHandle) => void;
}

export interface ModelViewerHandle {
    /** Re-fits the camera to the shown model from its initial direction. */
    resetView(): void;
}

export function ModelViewer(props: ModelViewerProps) {
    let canvas!: HTMLCanvasElement;
    let container!: HTMLDivElement;
    let stage: ModelStage | undefined;
    let disposed = false;
    props.handle?.({resetView: () => stage?.resetView()});
    const {_} = useLingui();
    // The note shows while the icon is hovered (mouse) or after it is pressed (touch, keyboard).
    const [infoHover, setInfoHover] = createSignal(false);
    const [infoPinned, setInfoPinned] = createSignal(false);
    const infoShown = () => infoHover() || infoPinned();
    const [ready, setReady] = createSignal(false);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal<"unsupported" | "load" | undefined>();

    onMount(async () => {
        try {
            const {ModelStage} = await import("~/components/model-viewer/engine");
            if (disposed) return;
            stage = new ModelStage(canvas, container);
            setReady(true);
        } catch (e) {
            console.error("[model-viewer] init failed:", e);
            setError("unsupported");
            setLoading(false);
        }
    });

    onCleanup(() => {
        disposed = true;
        stage?.dispose();
    });

    createEffect(() => {
        if (!ready()) return;
        const parts = props.parts;
        const tints = props.tints;
        const frameKey = props.frameKey;
        const viewDirection = props.viewDirection;
        if (!parts.length) {
            setLoading(false);
            return;
        }
        setLoading(true);
        stage!.show({parts, tints, frameKey, viewDirection}).then(r => {
            if (!r.current) return;
            setError(r.failed.length === parts.length ? "load" : undefined);
            setLoading(false);
        }).catch(e => {
            console.error("[model-viewer] show failed:", e);
            setError("load");
            setLoading(false);
        });
    });

    return (
        <div ref={container} class={cn("relative size-full min-h-64 overflow-hidden rounded-md bg-transparent", props.class)}>
            <canvas ref={canvas} class="block size-full touch-none"/>
            <Show when={loading()}>
                <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Spinner type={SpinnerType.ballTriangle}/>
                </div>
            </Show>
            <Show when={error()}>
                <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-foreground">
                    <Show when={error() === "unsupported"} fallback={<Trans>This model could not be loaded.</Trans>}>
                        <Trans>3D rendering is not available in this browser.</Trans>
                    </Show>
                </div>
            </Show>
            <div class="pointer-events-none absolute bottom-2 right-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-2">
                <div class={cn(
                    "w-max max-w-full rounded-md border bg-background/85 px-2 py-1 text-xs text-foreground transition-opacity",
                    infoShown() ? "opacity-100" : "opacity-0",
                )}>
                    <p><Trans>Left mouse: rotate · Right mouse: pan · Scroll: zoom</Trans></p>
                    <p class="text-muted-foreground"><Trans>Models are for reference only and may not reflect in-game appearance.</Trans></p>
                </div>
                <button
                    type="button"
                    class="pointer-events-auto flex size-7 shrink-0 items-center justify-center rounded-full bg-background/85 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={_(msg`Viewer controls and notice`)}
                    aria-expanded={infoShown()}
                    onPointerEnter={e => e.pointerType === "mouse" && setInfoHover(true)}
                    onPointerLeave={() => setInfoHover(false)}
                    onClick={() => setInfoPinned(p => !p)}
                    onBlur={() => setInfoPinned(false)}
                >
                    <IconInfo class="size-5"/>
                </button>
            </div>
        </div>
    );
}
