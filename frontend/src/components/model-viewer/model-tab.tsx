/**
 * Detail-page "3D Model" tab: a single glb with selectors for its mesh options, material variants
 * and alternatives, plus fullscreen.
 */

import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {Trans} from "@lingui/solid/macro";
import {A} from "@solidjs/router";
import {createEffect, createMemo, createResource, createSignal, For, on, Show, Suspense} from "solid-js";
import {isServer} from "solid-js/web";
import {FontIcon} from "~/components/icons/font-icons";
import {FullscreenButton, ResetViewButton, useFullscreen, useViewerHandle} from "~/components/model-viewer/fullscreen";
import {ModelViewer} from "~/components/model-viewer/ModelViewer";
import type {RelationshipTab} from "~/components/shared/DetailPageLayout";
import {Button} from "~/components/ui/button";
import {modelIndex, type ModelPart, type ModelTints} from "~/lib/models";
import {cn} from "~/lib/utils";

/** One selectable model: a single glb or a composed scene. */
export interface ModelOption {
    /** Shown as the button's tooltip. */
    label?: string;
    parts: ModelPart[];
}

interface ModelTabSource {
    /** Alternative single models for the object (e.g. a tool's `prefab_names`); one button each when several. */
    paths?: string[];
    /** Further options, listed after `paths`. */
    options?: ModelOption[];
    /** Initial material variant of single-model options. */
    variant?: number;
    /** Extra part fields for single-model options, e.g. `hairMesh`. */
    part?: Partial<ModelPart>;
    /** Initial camera direction from the target; defaults to a three-quarter view. */
    viewDirection?: [number, number, number];
    /** Dressing room URL (see `dressingRoomHref`) for objects that can be worn; adds a button beside fullscreen. */
    dressingRoom?: string;
    /** Runtime tints applied to every option, e.g. a mask pattern shown on a mask model. */
    tints?: ModelTints;
}

const namedOptions = (s: ModelTabSource | undefined): ModelOption[] => [
    ...(s?.paths ?? []).filter(Boolean).map(path => ({parts: [{id: "model", path}]})),
    ...(s?.options ?? []).filter(o => o.parts.length && o.parts.every(p => p.path)),
];

/**
 * The tab appears whenever the object names a model; whether the file is published is checked
 * when the tab is opened, so the tab list is identical on the server and the client.
 */
export function modelTab(source: () => ModelTabSource | undefined): RelationshipTab {
    return {
        id: "model",
        label: msg`3D Model`,
        count: namedOptions(source()).length,
        showWhenEmpty: false,
        content: () => (
            <Suspense fallback={<div class="min-h-80 h-[70svh] w-full"/>}>
                <Show when={source()}>{s => <ModelTabContent {...s()}/>}</Show>
            </Suspense>
        ),
    };
}

function OptionButtons(props: { label: string; count: number; value: number; onChange: (i: number) => void; titles?: (string | undefined)[] }) {
    return (
        <Show when={props.count > 1}>
            <div class="flex items-center gap-1">
                <span class="mr-1 text-xs text-white/70">{props.label}</span>
                <For each={Array.from({length: props.count}, (_, i) => i)}>
                    {i => (
                        <Button
                            size="sm"
                            variant={props.value === i ? "default" : "secondary"}
                            class="size-7 p-0"
                            title={props.titles?.[i]}
                            onClick={() => props.onChange(i)}
                        >
                            {i + 1}
                        </Button>
                    )}
                </For>
            </div>
        </Show>
    );
}

function ModelTabContent(props: ModelTabSource) {
    const {_} = useLingui();
    const index = () => modelIndex();
    const loaded = () => index() !== undefined;
    const options = createMemo(() => {
        const idx = index();
        const all = namedOptions(props);
        return idx ? all.filter(o => o.parts.every(p => p.path in idx)) : all;
    });

    const [optionIdx, setOptionIdx] = createSignal(0);
    const [variant, setVariant] = createSignal(props.variant ?? 0);
    const [alt, setAlt] = createSignal(0);
    const option = () => loaded() ? options()[optionIdx()] : undefined;
    /** Material variants and alternatives are only offered for single-glb options. */
    const path = () => {
        const o = option();
        return o?.parts.length === 1 ? o.parts[0].path : undefined;
    };

    const [info] = createResource(() => (isServer ? undefined : path()), async p => (await import("~/components/model-viewer/engine")).inspectModel(p));
    // `latest` avoids re-suspending on refetch (variant/model switches); the first load suspends
    // into the tab's own boundary in `modelTab`. A failed inspection simply has no options.
    const modelInfo = () => (info.error ? undefined : info.latest);

    createEffect(on(option, () => {
        setVariant(props.variant ?? 0);
        setAlt(0);
    }, {defer: true}));

    const parts = createMemo<ModelPart[]>(() => {
        const o = option();
        if (!o) return [];
        if (o.parts.length !== 1) return o.parts;
        const v = variant();
        return [{...o.parts[0], variant: v < (modelInfo()?.variants ?? 1) ? v : 0, alternative: modelInfo()?.alternatives[alt()] ?? 0, ...props.part}];
    });
    const frameKey = () => option()?.parts.map(p => p.path).join("|");

    const fs = useFullscreen();
    const viewer = useViewerHandle();

    return (
        <Show
            when={!loaded() || options().length}
            fallback={<p class="text-sm text-muted-foreground"><Trans>No 3D model has been published for this object.</Trans></p>}
        >
            <div ref={fs.ref} class={cn("relative min-h-80 w-full", fs.fullscreen() ? "h-screen" : "h-[70svh]")}>
                <ModelViewer parts={parts()} tints={props.tints} frameKey={frameKey()} viewDirection={props.viewDirection} handle={viewer.handle}/>
                <div class="absolute left-2 top-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-black/50 px-2 py-1 empty:hidden">
                    <OptionButtons label={_(msg`Model`)} count={options().length} value={optionIdx()} onChange={setOptionIdx} titles={options().map(o => o.label)}/>
                    <Show when={modelInfo()}>
                        {i => <>
                            <OptionButtons label={_(msg`Variant`)} count={i().variants} value={variant()} onChange={setVariant}/>
                            <OptionButtons label={_(msg`Alternative`)} count={i().alternatives.length} value={alt()} onChange={setAlt}/>
                        </>}
                    </Show>
                </div>
                <div class="absolute right-2 top-2 flex gap-2">
                    <Show when={props.dressingRoom}>
                        {href => (
                            <Button
                                as={A}
                                href={href()}
                                size="icon"
                                variant="secondary"
                                class="size-8"
                                aria-label={_(msg`Try on in the Dressing Room`)}
                                title={_(msg`Try on in the Dressing Room`)}
                            >
                                <FontIcon codepoint="FF58" class="size-4"/>
                            </Button>
                        )}
                    </Show>
                    <ResetViewButton viewer={viewer}/>
                    <FullscreenButton fs={fs}/>
                </div>
            </div>
        </Show>
    );
}
