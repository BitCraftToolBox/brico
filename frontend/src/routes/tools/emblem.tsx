import {createMemo, createSignal, For, Show} from "solid-js";
import {EmpireColorDesc} from "~/bindings/src/empire_color_desc_type";
import {EmpireIconDesc} from "~/bindings/src/empire_icon_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {GLYPH_ICONS} from "~/components/icons/font-icons-data";
import MainLayout from "~/components/MainLayout";
import {Button} from "~/components/ui/button";
import {Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {loadTableAdHoc} from "~/lib/spacetime";


function argbToHex(argb: bigint): string {
    // u64 in rust, so need to accommodate the bindings here even though no actual color desc will surpass this
    const n = Number(argb & 0xFF_FF_FF_FFn);
    const r = (n >> 16) & 0xFF;
    const g = (n >> 8) & 0xFF;
    const b = n & 0xFF;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function getIconEntry(iconUnicode: string) {
    // all empire_icon_descs are in this format, no need for all the other matching that font-icons does
    const escapeMatch = iconUnicode.match(/^\\u([0-9A-Fa-f]{4,5})$/);
    if (escapeMatch) {
        return GLYPH_ICONS[escapeMatch[1].toUpperCase()];
    }
    return undefined;
}

function GridSection<T extends {id: number}>(props: {
    title: string;
    items: T[];
    selectedId: number | undefined;
    onSelect: (item: T) => void;
    renderItem: (item: T, isSelected: () => boolean) => any;
    showBorder?: boolean;
}) {
    return (
        <div class={`flex flex-col max-h-1/2 ${props.showBorder ? "border-b pb-1" : ""}`}>
            <h3 class="shrink-0 text-sm font-semibold text-muted-foreground px-1 py-1">{props.title}</h3>
            <div class="flex-1 overflow-y-auto min-h-0">
                <div class="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1 p-1">
                    <For each={props.items}>
                        {(item) => {
                            const isSelected = () => props.selectedId === item.id;
                            return (
                                <button
                                    onClick={() => props.onSelect(item)}
                                    title={`${props.title} ${item.id}`}
                                >
                                    {props.renderItem(item, isSelected)}
                                </button>
                            );
                        }}
                    </For>
                </div>
            </div>
        </div>
    );
}

function renderIconItem(item: EmpireIconDesc, isSelected: () => boolean) {
    return (
        <div
            class={`aspect-square flex items-center justify-center rounded border transition-colors hover:bg-accent ${
                isSelected()
                    ? "border-primary bg-accent"
                    : "border-transparent"
            }`}
        >
            <FontIcon codepoint={item.iconUnicode} class="size-6"/>
        </div>
    );
}

function renderColorItem(color: EmpireColorDesc, isSelected: () => boolean) {
    return (
        <div
            class={`aspect-square rounded border transition-colors hover:ring-2 hover:ring-info-foreground ${
                isSelected()
                    ? "ring-2 ring-info-foreground border-transparent"
                    : "border-transparent"
            }`}
            style={{"background-color": argbToHex(color.colorArgb)}}
        />
    );
}

function renderShapeColorItem(color: EmpireColorDesc, isSelected: () => boolean) {
    const bg = argbToHex(color.color2Argb!);
    const fg = argbToHex(color.colorArgb);
    return (
        <div
            class={`aspect-square rounded border transition-colors hover:ring-2 hover:ring-info-foreground ${
                isSelected()
                    ? "ring-2 ring-info-foreground border-transparent"
                    : "border-transparent"
            }`}
            style={{
                background: `linear-gradient(135deg, ${fg} 50%, ${bg} 50%)`,
            }}
        />
    );
}

// these will pull in only when this module is loaded. prevents preloading them since they aren't used in any other data-related stuff
const iconTable = loadTableAdHoc<EmpireIconDesc>("empire_icon_desc", EmpireIconDesc);
const colorTable = loadTableAdHoc<EmpireColorDesc>("empire_color_desc", EmpireColorDesc);

export default function EmblemEditor() {
    const icons = createMemo(() => (iconTable.get() ?? []).filter(r => !r.isShape));
    const shapes = createMemo(() => (iconTable.get() ?? []).filter(r => r.isShape));
    const iconColors = createMemo(() => (colorTable.get() ?? []).filter(r => r.color2Argb === undefined));
    const shapeColors = createMemo(() => (colorTable.get() ?? []).filter(r => r.color2Argb !== undefined));

    const [selectedIcon, setSelectedIcon] = createSignal<EmpireIconDesc | null>(null);
    const [selectedShape, setSelectedShape] = createSignal<EmpireIconDesc | null>(null);
    const [selectedIconColor, setSelectedIconColor] = createSignal<EmpireColorDesc | null>(null);
    const [selectedShapeColor, setSelectedShapeColor] = createSignal<EmpireColorDesc | null>(null);
    const reset = () => {
        setSelectedIconColor(null);
        setSelectedShapeColor(null);
        setSelectedIcon(null);
        setSelectedShape(null);
    }

    const iconColorHex = createMemo(() => selectedIconColor() ? argbToHex(selectedIconColor()!.colorArgb) : "#FFFFFF");
    const shapeColorHex = createMemo(() => selectedShapeColor() ? argbToHex(selectedShapeColor()!.colorArgb) : "#888888");
    const shapeBgHex = createMemo(() => selectedShapeColor()?.color2Argb ? argbToHex(selectedShapeColor()!.color2Argb!) : "#FF000000");

    const CANVAS_SIZE = 256;
    const ICON_SIZE = CANVAS_SIZE * 0.55;
    const SHAPE_SIZE = ICON_SIZE * 1.85;
    const SHADOW_PX = Math.round(ICON_SIZE * 0.07);

    return (
        <MainLayout title="Emblem Editor">
            <div class="flex flex-col items-center gap-4 w-full max-w-3xl mx-auto h-full">
                <div
                    class="shrink-0 relative"
                    style={{width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`}}
                >
                    <div
                        class="absolute inset-0 rounded-sm border-border border-2 overflow-hidden"
                        style={{"background-color": shapeBgHex()}}
                    >
                        <Show when={selectedShape()} keyed>
                            {shape =>
                                <div
                                    class="absolute inset-0 flex items-center justify-center"
                                    style={{color: shapeColorHex()}}
                                >
                                    <FontIcon
                                        codepoint={shape.iconUnicode}
                                        style={{width: `${SHAPE_SIZE}px`, height: `${SHAPE_SIZE}px`}}
                                    />
                                </div>
                            }
                        </Show>
                    </div>

                    {/* masking logic via https://codepen.io/jointjs/pen/LYvGgpB/80aaa0aaeb70ff7a4afc46e73cfdc2a6 */}
                    <Show when={selectedIcon()} keyed>
                        {icon => {
                            const entry = getIconEntry(icon.iconUnicode);
                            if (!entry) return null;
                            const [vbX, vbY, vbW] = entry.viewBox.split(" ").map(Number);
                            // Convert SHADOW_PX (CSS pixels) into viewBox units.
                            // The SVG is rendered at ICON_SIZE px wide over vbW viewBox units.
                            const outerSW = 2 * SHADOW_PX * (vbW / ICON_SIZE);
                            // Inflate mask rect enough to cover miter spikes and stroke overhang
                            const clip = outerSW + 50;
                            const maskId = `emblem-outline-${icon.id}`;
                            return (
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <svg
                                        viewBox={entry.viewBox}
                                        overflow="visible"
                                        style={{
                                            width: `${ICON_SIZE}px`,
                                            height: `${ICON_SIZE}px`,
                                        }}
                                    >
                                    <defs>
                                        <mask id={maskId}>
                                            {/* Outer: expanded silhouette in white */}
                                            <g
                                                color="white"
                                                fill="currentColor"
                                                stroke="currentColor"
                                                stroke-width={outerSW}
                                                stroke-linejoin="miter"
                                                innerHTML={entry.c}
                                            />
                                            {/* Inner: original shape in black — carves out the center */}
                                            <g
                                                color="black"
                                                fill="currentColor"
                                                innerHTML={entry.c}
                                            />
                                        </mask>
                                    </defs>
                                    {/* Colored rect visible only through the outline ring */}
                                    <rect
                                        x={vbX - clip}
                                        y={vbY - clip}
                                        width={vbW + clip * 2}
                                        height={vbW + clip * 2}
                                        fill={shapeColorHex()}
                                        mask={`url(#${maskId})`}
                                    />
                                </svg>
                                </div>
                            );
                        }}
                    </Show>

                    <Show when={selectedIcon()} keyed>
                        {icon =>
                            <div class="absolute inset-0 flex items-center justify-center">
                                <FontIcon
                                    codepoint={icon.iconUnicode}
                                    style={{
                                        color: iconColorHex(),
                                        width: `${ICON_SIZE}px`,
                                        height: `${ICON_SIZE}px`,
                                    }}
                                />
                            </div>
                        }
                    </Show>
                </div>

                <div class="flex items-center justify-around w-full">
                    <Button variant="outline" size="sm" onClick={reset}>Reset</Button>
                </div>

                <Tabs defaultValue="icon" class="w-full flex flex-col flex-1 min-h-0">
                    <TabsList class="w-full shrink-0 justify-center">
                        <TabsTrigger value="icon">Icon</TabsTrigger>
                        <TabsTrigger value="shape">Shape</TabsTrigger>
                        <TabsIndicator/>
                    </TabsList>

                    <TabsContent value="icon" class="flex-1 min-h-0 mt-0 flex flex-col gap-0">
                        <GridSection
                            title="Icons"
                            items={icons()}
                            selectedId={selectedIcon()?.id}
                            onSelect={setSelectedIcon}
                            renderItem={renderIconItem}
                            showBorder
                        />
                        <GridSection
                            title="Icon Colors"
                            items={iconColors()}
                            selectedId={selectedIconColor()?.id}
                            onSelect={setSelectedIconColor}
                            renderItem={renderColorItem}
                        />
                    </TabsContent>

                    <TabsContent value="shape" class="flex-1 min-h-0 mt-0 flex flex-col gap-0">
                        <GridSection
                            title="Shapes"
                            items={shapes()}
                            selectedId={selectedShape()?.id}
                            onSelect={setSelectedShape}
                            renderItem={renderIconItem}
                            showBorder
                        />
                        <GridSection
                            title="Shape Colors"
                            items={shapeColors()}
                            selectedId={selectedShapeColor()?.id}
                            onSelect={setSelectedShapeColor}
                            renderItem={renderShapeColorItem}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </MainLayout>
    );
}
