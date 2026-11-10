/**
 * Viewer frame controls: `useFullscreen()` gives the element ref and state and `FullscreenButton`
 * toggles it (hidden where the browser has no fullscreen support); `useViewerHandle()` and
 * `ResetViewButton` re-fit the camera.
 */

import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {TbOutlineFocusCentered as IconReset, TbOutlineMaximize as IconMaximize, TbOutlineMinimize as IconMinimize,} from "solid-icons/tb";
import {createSignal, onCleanup, onMount, Show} from "solid-js";
import type {ModelViewerHandle} from "~/components/model-viewer/ModelViewer";
import {Button} from "~/components/ui/button";

export function useFullscreen() {
    let frame: HTMLElement | undefined;
    const [fullscreen, setFullscreen] = createSignal(false);
    const [available, setAvailable] = createSignal(false);
    onMount(() => {
        setAvailable(document.fullscreenEnabled);
        const onChange = () => setFullscreen(document.fullscreenElement === frame);
        document.addEventListener("fullscreenchange", onChange);
        onCleanup(() => document.removeEventListener("fullscreenchange", onChange));
    });
    return {
        ref: (el: HTMLElement) => (frame = el),
        fullscreen,
        available,
        toggle: () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frame?.requestFullscreen();
        },
    };
}

export type Fullscreen = ReturnType<typeof useFullscreen>;

/** Collects the viewer's controls so a button outside it can use them; pass `handle` to `ModelViewer`. */
export function useViewerHandle() {
    let viewer: ModelViewerHandle | undefined;
    return {handle: (h: ModelViewerHandle) => (viewer = h), resetView: () => viewer?.resetView()};
}

export type ViewerHandle = ReturnType<typeof useViewerHandle>;

export function ResetViewButton(props: { viewer: ViewerHandle }) {
    const {_} = useLingui();
    return (
        <Button
            size="icon"
            variant="secondary"
            class="size-8"
            aria-label={_(msg`Reset view`)}
            title={_(msg`Reset view`)}
            onClick={() => props.viewer.resetView()}
        >
            <IconReset class="size-4"/>
        </Button>
    );
}

export function FullscreenButton(props: { fs: Fullscreen }) {
    const {_} = useLingui();
    return (
        <Show when={props.fs.available()}>
            <Button
                size="icon"
                variant="secondary"
                class="size-8"
                aria-label={props.fs.fullscreen() ? _(msg`Exit fullscreen`) : _(msg`Fullscreen`)}
                onClick={props.fs.toggle}
            >
                <Show when={props.fs.fullscreen()} fallback={<IconMaximize class="size-4"/>}><IconMinimize class="size-4"/></Show>
            </Button>
        </Show>
    );
}
