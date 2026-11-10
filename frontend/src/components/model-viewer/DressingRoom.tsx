/**
 * DressingRoom — the character preview with a column of slot buttons on each side. Each button opens a
 * searchable picker over the collectibles of that type (the hand slot picks equipment items).
 */

import type {CollectibleDesc, EquipmentDesc, ItemDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {useLingui} from "@lingui/solid";
import {useSearchParams} from "@solidjs/router";
import {TbOutlineCheck as IconCheck, TbOutlineChevronRight as IconChevron, TbOutlineLink as IconLink} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, For, type JSX, Show, untrack} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {FontIcon} from "~/components/icons/font-icons";
import {FullscreenButton, ResetViewButton, useFullscreen, useViewerHandle} from "~/components/model-viewer/fullscreen";
import {ModelViewer} from "~/components/model-viewer/ModelViewer";
import {type PickerOption, SlotPicker} from "~/components/model-viewer/SlotPicker";
import {CollectibleIcon, ItemIcon} from "~/components/shared/GameIcon";
import {Button} from "~/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {collectibleTypeLabel} from "~/lib/game-strings";
import {gameText, useLabel} from "~/lib/labels";
import {
    characterModel,
    CUSTOMIZATION_TYPES,
    customizationPath,
    DRESSING_ROOM_SLOTS,
    dressingRoomHref,
    hasModel,
    modelIndex,
    type ModelSlot,
    TINT_SLOTS,
    TOOL_MESH_PARAM,
} from "~/lib/models";
import {cn, useCopy} from "~/lib/utils";

interface SlotDef {
    /** Collectible type tag, or `Tool` for the hand slot. */
    id: string;
    codepoint: string;
}

const LEFT_SLOTS: SlotDef[] = [
    {id: "Tool", codepoint: "FFAE"},
    {id: "ClothesHead", codepoint: "FFDD"},
    {id: "ClothesTorso", codepoint: "FFE2"},
    {id: "ClothesArms", codepoint: "FFC7"},
    {id: "ClothesBelt", codepoint: "FFD6"},
    {id: "ClothesLegs", codepoint: "FFDB"},
    {id: "ClothesFeet", codepoint: "FFDA"},
    {id: "ClothesCape", codepoint: "FF7B"},
];

const RIGHT_SLOTS: SlotDef[] = [
    {id: "BodyColor", codepoint: "FFD2"},
    {id: "Mask", codepoint: "FFC9"},
    {id: "MaskPattern", codepoint: "FFCA"},
    {id: "Hair", codepoint: "FFC8"},
    {id: "HairColor", codepoint: "FFD1"},
    {id: "FacialHair", codepoint: "FF55"},
    {id: "FaceAccessory", codepoint: "FF56"},
    {id: "Crown", codepoint: "0044"},
];

const TINT_TYPES = new Set<string>(TINT_SLOTS);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function SlotButton(props: {
    label: string;
    codepoint: string;
    options: PickerOption[];
    selected: PickerOption | undefined;
    onSelect: (option: PickerOption | undefined) => void;
    /** Rendered beside the button (the tool's mesh selector). */
    aside?: JSX.Element;
}) {
    const {_} = useLingui();
    const [open, setOpen] = createSignal(false);
    return (
        <div class="relative">
            <Popover open={open()} onOpenChange={setOpen} placement="bottom">
                <PopoverTrigger
                    as={Button}
                    type="button"
                    variant="outline"
                    class={cn("size-16 overflow-hidden p-0 [&_svg]:size-8", props.selected && "border-primary/60")}
                    title={props.selected ? `${props.label}: ${props.selected.name}` : props.label}
                    aria-label={props.label}
                >
                    <Show when={props.selected} keyed fallback={<FontIcon codepoint={props.codepoint} class="size-8 text-muted-foreground"/>}>
                        {s => s.icon()}
                    </Show>
                </PopoverTrigger>
                <PopoverContent class="w-80 p-2">
                    <SlotPicker
                        options={props.options}
                        clearLabel={_(msg`None`)}
                        onSelect={(o, keepOpen) => {
                            props.onSelect(o);
                            if (!keepOpen) setOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
            {props.aside}
        </div>
    );
}

export default function DressingRoom() {
    const label = useLabel();
    const {_} = useLingui();
    const isLoading = useTablesLoading(BitCraftTables.CollectibleDesc, BitCraftTables.EquipmentDesc, BitCraftTables.ItemDesc, BitCraftTables.ClothingDesc);

    const collectibles = BitCraftTables.CollectibleDesc.get;
    const equipment = BitCraftTables.EquipmentDesc.get;
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const clothingIndex = BitCraftTables.ClothingDesc.indexedBy("itemId");

    const [chosen, setChosen] = createSignal<Record<string, CollectibleDesc | undefined>>({});
    const [tool, setTool] = createSignal<{ item: ItemDesc; equipment: EquipmentDesc; meshIndex: number }>();
    const [meshOpen, setMeshOpen] = createSignal(false);

    const optionsByType = createMemo(() => {
        const map = new Map<string, { row: CollectibleDesc; option: PickerOption }[]>();
        for (const row of collectibles() ?? []) {
            const type = row.collectibleType.tag;
            if (!CUSTOMIZATION_TYPES.has(type) && !TINT_TYPES.has(type)) continue;
            if (!row.name) continue;
            if (!TINT_TYPES.has(type)) {
                const path = customizationPath(row);
                if (!path || !hasModel(path)) continue;
            }
            const entry = {
                row,
                option: {
                    id: row.id, name: row.name, rarity: row.collectibleRarity,
                    icon: () => <CollectibleIcon collectible={row} noInteract class="mx-0"/>,
                } satisfies PickerOption,
            };
            const list = map.get(type);
            if (list) list.push(entry); else map.set(type, [entry]);
        }
        for (const list of map.values()) list.sort((a, b) => byName(a.row, b.row));
        return map;
    });

    const toolOptions = createMemo(() => {
        const items = itemIndex();
        const out: { item: ItemDesc; equipment: EquipmentDesc; option: PickerOption }[] = [];
        for (const eq of equipment() ?? []) {
            const prefabs = eq.handEquipmentVisual?.prefabNames;
            const item = items.get(eq.itemId);
            if (!prefabs?.length || !item || !prefabs.some(hasModel)) continue;
            out.push({
                item, equipment: eq,
                option: {
                    id: item.id, name: item.name, tier: item.tier, rarity: item.rarity,
                    icon: () => <ItemIcon item={item} noInteract class="mx-0"/>,
                },
            });
        }
        return out.sort((a, b) => byName(a.item, b.item) || a.item.tier - b.item.tier);
    });

    // Preload the slots named in the URL (one query parameter per slot id) once the tables are ready,
    // then remove them so the address bar doesn't go stale as the outfit changes.
    const [searchParams, setSearchParams] = useSearchParams();
    let preloaded = false;
    createEffect(() => {
        if (preloaded || isLoading() || modelIndex() === undefined) return;
        preloaded = true;
        untrack(() => {
            const fromUrl: Record<string, CollectibleDesc> = {};
            for (const [type, entries] of optionsByType()) {
                const id = Number(searchParams[type]);
                const row = id ? entries.find(e => e.row.id === id)?.row : undefined;
                if (row) fromUrl[type] = row;
            }
            if (Object.keys(fromUrl).length) setChosen(fromUrl);
            const toolId = Number(searchParams.Tool);
            const found = toolId ? toolOptions().find(t => t.item.id === toolId) : undefined;
            if (found) {
                const meshes = found.equipment.handEquipmentVisual?.prefabNames.length ?? 1;
                const meshIndex = Math.min(Math.max(Math.trunc(Number(searchParams[TOOL_MESH_PARAM])) || 0, 0), meshes - 1);
                setTool({item: found.item, equipment: found.equipment, meshIndex});
            }
            const consumed = [...DRESSING_ROOM_SLOTS, TOOL_MESH_PARAM].filter(key => searchParams[key] !== undefined);
            if (consumed.length) setSearchParams(Object.fromEntries(consumed.map(key => [key, undefined])), {replace: true});
        });
    });

    const [copyLink, linkCopied] = useCopy(() => {
        const selection: Record<string, number | undefined> = {Tool: tool()?.item.id};
        for (const [type, row] of Object.entries(chosen())) selection[type] = row?.id;
        return `${window.location.origin}${dressingRoomHref(selection, tool()?.meshIndex)}`;
    });
    const fs = useFullscreen();
    const viewer = useViewerHandle();

    const model = createMemo(() => {
        const c = chosen();
        const t = tool();
        const slots: Partial<Record<ModelSlot, CollectibleDesc>> = {};
        for (const [type, row] of Object.entries(c)) if (row && CUSTOMIZATION_TYPES.has(type)) slots[type as ModelSlot] = row;
        return characterModel({
            slots,
            bodyColor: c.BodyColor,
            hairColor: c.HairColor,
            maskPattern: c.MaskPattern,
            tool: t && {paths: t.equipment.handEquipmentVisual!.prefabNames, index: t.meshIndex},
        }, id => clothingIndex().get(id)?.mask.tag);
    });

    const slotLabel = (slot: SlotDef) => slot.id === "Tool"
        ? `${label(gameText(msg`Tool`))} / ${label(gameText(msg`Weapon`))}`
        : collectibleTypeLabel(slot.id);

    const renderSlot = (slot: SlotDef) => {
        if (slot.id === "Tool") {
            const meshCount = () => tool()?.equipment.handEquipmentVisual?.prefabNames.length ?? 0;
            return (
                <SlotButton
                    label={slotLabel(slot)}
                    codepoint={slot.codepoint}
                    options={toolOptions().map(o => o.option)}
                    selected={toolOptions().find(o => o.item.id === tool()?.item.id)?.option}
                    onSelect={o => {
                        const found = o && toolOptions().find(t => t.item.id === o.id);
                        setTool(found && {item: found.item, equipment: found.equipment, meshIndex: 0});
                    }}
                    aside={
                        <Show when={meshCount() > 1}>
                            <Popover open={meshOpen()} onOpenChange={setMeshOpen} placement="right">
                                <PopoverTrigger
                                    as={Button}
                                    type="button"
                                    variant="ghost"
                                    class="absolute top-1/2 h-10 w-5 -translate-y-1/2 p-0"
                                    aria-label={_(msg`Model`)}
                                    title={_(msg`Model`)}
                                >
                                    <IconChevron class="size-4"/>
                                </PopoverTrigger>
                                <PopoverContent class="flex w-auto gap-1 p-2">
                                    <For each={Array.from({length: meshCount()}, (_, i) => i)}>
                                        {i => (
                                            <Button
                                                size="sm"
                                                variant={tool()?.meshIndex === i ? "default" : "secondary"}
                                                class="size-8 p-0"
                                                onClick={() => {
                                                    setTool(t => t && {...t, meshIndex: i});
                                                    setMeshOpen(false);
                                                }}
                                            >
                                                {i + 1}
                                            </Button>
                                        )}
                                    </For>
                                </PopoverContent>
                            </Popover>
                        </Show>
                    }
                />
            );
        }
        const entries = () => optionsByType().get(slot.id) ?? [];
        return (
            <SlotButton
                label={slotLabel(slot)}
                codepoint={slot.codepoint}
                options={entries().map(e => e.option)}
                selected={entries().find(e => e.row.id === chosen()[slot.id]?.id)?.option}
                onSelect={o => setChosen(c => ({...c, [slot.id]: o && entries().find(e => e.row.id === o.id)?.row}))}
            />
        );
    };

    return (
        <Show
            when={!isLoading() && modelIndex() !== undefined}
            fallback={<div class="flex items-center justify-center py-20"><Spinner type={SpinnerType.ballTriangle}/></div>}
        >
            <div class="mx-auto grid w-full max-w-4xl grid-cols-[auto_1fr_auto] gap-x-3 sm:gap-x-3 py-3 border rounded-md bg-background">
                <div class="flex flex-col justify-between gap-2 pl-3"><For each={LEFT_SLOTS}>{renderSlot}</For></div>
                <div ref={fs.ref} class={cn("relative min-h-96", fs.fullscreen() ? "h-screen" : "h-[75svh]")}>
                    <ModelViewer parts={model().parts} tints={model().tints} frameKey="character" viewDirection={[0, 0.15, 1]} handle={viewer.handle}/>
                    <div class="absolute right-2 top-2 flex gap-2">
                        <Button
                            size="icon"
                            variant="secondary"
                            class={cn("size-8", linkCopied() && "bg-success text-white hover:bg-success/90")}
                            aria-label={_(msg`Copy link to this outfit`)}
                            title={linkCopied() ? _(msg`Copied!`) : _(msg`Copy link to this outfit`)}
                            onClick={copyLink}
                        >
                            <Show when={linkCopied()} fallback={<IconLink class="size-4"/>}><IconCheck class="size-4"/></Show>
                        </Button>
                        <ResetViewButton viewer={viewer}/>
                        <FullscreenButton fs={fs}/>
                    </div>
                </div>
                <div class="flex flex-col justify-between gap-2 pr-3"><For each={RIGHT_SLOTS}>{renderSlot}</For></div>
            </div>
        </Show>
    );
}
