/**
 * 3D model paths, the CDN model index, and the part lists the model viewer renders.
 * Part and tint semantics follow the model pipeline's viewer contract (automata `scripts/assets/MODELS.md`).
 */

import type {ClothingMask, CollectibleDesc} from "@brico/bitcraft-bindings/types";
import {createSignal} from "solid-js";
import {isServer} from "solid-js/web";
import {ASSET_CDN_BASE} from "~/lib/bitcraft-utils";

export const MODEL_BASE = `${ASSET_CDN_BASE}/prefabs`;

/** `path` is the raw game-data value (or `prefab_names[i]` GUID), without extension. */
export function modelUrl(path: string): string {
    return `${MODEL_BASE}/${encodeURI(path)}.glb`;
}

// ── Index ─────────────────────────────────────────────────────

export type ModelIndex = Record<string, { kind: string; size: number; sha1: string }>;

/** `undefined` until fetched, `null` when the fetch failed. */
const [indexSignal, setIndexSignal] = createSignal<ModelIndex | null | undefined>(undefined);
let indexRequest: Promise<void> | undefined;

/** Reactive accessor for the published-model index; the first client-side read starts the fetch. */
export function modelIndex(): ModelIndex | null | undefined {
    if (!isServer && !indexRequest) {
        indexRequest = fetch(`${MODEL_BASE}/index.json`)
            .then(r => {
                if (!r.ok) throw new Error(`model index: ${r.status}`);
                return r.json();
            })
            .then(j => setIndexSignal(j.models ?? {}))
            .catch(e => {
                console.error("[models] failed to load index:", e);
                setIndexSignal(null);
            });
    }
    return indexSignal();
}

/** True while the index is unknown or failed (callers then try the model anyway). */
export function hasModel(path: string): boolean {
    const idx = modelIndex();
    return !idx || path in idx;
}

// ── Character composition ─────────────────────────────────────

export type HairMesh = "default" | "full" | "bottom" | "front" | "none";

export interface ModelPart {
    /** Stable identity within a scene (slot name for characters). */
    id: string;
    path: string;
    /** `KHR_materials_variants` variant index. */
    variant?: number;
    /** Which alternative (`randomVariant`/`columnVariant` index) to show. */
    alternative?: number;
    /** Hair parts only; defaults to `default`. */
    hairMesh?: HairMesh;
    /** World offset of the part (game units). */
    position?: [number, number, number];
    /** Rotation about the vertical axis, radians. */
    rotationY?: number;
}

/** `HexMetrics.InnerRadius`: distance from a small hex tile's center to an edge midpoint. */
const HEX_INNER_RADIUS = 2.8867512;

/**
 * A straight run of wall: an end post on each side and one tile per section in between. A post tile
 * is a large post at the tile center plus a small-post arm (local +z) toward each connected neighbor;
 * a straight tile is one section spanning the tile along local x.
 */
export function wallRunParts(wall: { largePost: string; smallPost: string; sections: string[] }): ModelPart[] {
    const tiles = wall.sections.length + 2;
    const step = 2 * HEX_INNER_RADIUS;
    const x = (t: number) => (t - (tiles - 1) / 2) * step;
    const parts: ModelPart[] = [
        {id: "post-0", path: wall.largePost, position: [x(0), 0, 0]},
        {id: "arm-0", path: wall.smallPost, position: [x(0), 0, 0], rotationY: Math.PI / 2},
        {id: `post-${tiles - 1}`, path: wall.largePost, position: [x(tiles - 1), 0, 0]},
        {id: `arm-${tiles - 1}`, path: wall.smallPost, position: [x(tiles - 1), 0, 0], rotationY: -Math.PI / 2},
    ];
    wall.sections.forEach((path, i) => parts.push({id: `section-${i}`, path, position: [x(i + 1), 0, 0]}));
    return parts;
}

/** Model-space direction of footprint +x on the hex grid (a hex axis, 150° from model +x). */
const FOOTPRINT_X_DIR: [number, number] = [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];

/**
 * A gate is its own model at the origin tile, laid along the footprint's x axis: walkable tiles in
 * the middle and a hitbox tile at each end, where a small-post arm points away from the gate.
 * Assumes gate footprints lie on z = 0, as every gate in the game data does; a gate with other
 * offsets needs the hex-to-world mapping extended.
 */
export function gateParts(gate: { model: string; smallPost: string; walkableX: number[]; hitboxX: number[] }): ModelPart[] {
    const mid = gate.walkableX.reduce((a, b) => a + b, 0) / (gate.walkableX.length || 1);
    const step = 2 * HEX_INNER_RADIUS;
    const parts: ModelPart[] = [{id: "gate", path: gate.model}];
    for (const x of gate.hitboxX) {
        const dx = FOOTPRINT_X_DIR[0] * Math.sign(x - mid);
        const dz = FOOTPRINT_X_DIR[1] * Math.sign(x - mid);
        parts.push({
            id: `arm-${x}`,
            path: gate.smallPost,
            position: [FOOTPRINT_X_DIR[0] * x * step, 0, FOOTPRINT_X_DIR[1] * x * step],
            rotationY: Math.atan2(dx, dz),
        });
    }
    return parts;
}

/** A BodyColor / HairColor / MaskPattern collectible row (or anything shaped like one). */
export type TintRow = Pick<CollectibleDesc, "color" | "emission" | "variant">;

export interface ModelTints {
    bodyColor?: TintRow;
    hairColor?: TintRow;
    maskPattern?: TintRow;
}

/** Model-bearing collectible types, in draw order. */
export const MODEL_SLOTS = [
    "ClothesHead", "Hair", "FacialHair", "FaceAccessory", "Mask", "Crown",
    "ClothesTorso", "ClothesArms", "ClothesBelt", "ClothesLegs", "ClothesFeet", "ClothesCape",
] as const;
export type ModelSlot = typeof MODEL_SLOTS[number];

/** Slots that draw `Customization/Default/<slot>` while empty. */
const DEFAULTED_SLOTS = new Set<string>(["ClothesHead", "ClothesTorso", "ClothesArms", "ClothesBelt", "ClothesLegs", "ClothesFeet", "ClothesCape", "Mask"]);

/** Collectible types whose rows have a model of their own under `Customization/`. */
export const CUSTOMIZATION_TYPES = new Set<string>(MODEL_SLOTS);

/** Part path for a customization collectible row. */
export function customizationPath(row: Pick<CollectibleDesc, "modelAssetName"> & { collectibleType: { tag: string } }): string | undefined {
    if (!row.modelAssetName) return undefined;
    if (row.modelAssetName === "Default") return `Customization/Default/${row.collectibleType.tag}`;
    return `Customization/${row.modelAssetName}`;
}

/** Path of the single model shown on a collectible's detail page, if its type has one. */
export function collectibleModelPath(row: CollectibleDesc): string | undefined {
    const type = row.collectibleType.tag;
    if (type === "Pet") return row.modelAssetName || undefined;
    return CUSTOMIZATION_TYPES.has(type) ? customizationPath(row) : undefined;
}

/**
 * A mask pattern has no model of its own: it replaces the pattern placeholder of a mask. Shown on the
 * default mask (which carries the placeholder) over the default head, so the mask sits on a face.
 */
export const MASK_PATTERN_PARTS: ModelPart[] = [
    {id: "ClothesHead", path: "Customization/Default/ClothesHead"},
    {id: "Mask", path: "Customization/Default/Mask"},
];

// ── Dressing room links ───────────────────────────────────────

export const DRESSING_ROOM_PATH = "/tools/dressing-room";

/** Collectible types that only tint the character (they carry no model of their own). */
export const TINT_SLOTS = ["BodyColor", "HairColor", "MaskPattern"] as const;

/** Dressing room slot ids: the collectible types it edits, plus `Tool` for the hand slot (an item id). */
export const DRESSING_ROOM_SLOTS = new Set<string>(["Tool", ...MODEL_SLOTS, ...TINT_SLOTS]);

/** Query parameter selecting which of a multi-mesh tool's models to show. */
export const TOOL_MESH_PARAM = "ToolMesh";

/**
 * Dressing room URL preloading `selection` (slot id -> collectible id, or item id for `Tool`).
 * Each slot is its own query parameter; `toolMesh` selects a hand item's alternate mesh.
 */
export function dressingRoomHref(selection: Record<string, number | undefined>, toolMesh = 0): string {
    const params = new URLSearchParams();
    for (const [slot, id] of Object.entries(selection)) if (id !== undefined && DRESSING_ROOM_SLOTS.has(slot)) params.set(slot, String(id));
    if (toolMesh > 0) params.set(TOOL_MESH_PARAM, String(toolMesh));
    const query = params.toString();
    return query ? `${DRESSING_ROOM_PATH}?${query}` : DRESSING_ROOM_PATH;
}

/** Dressing room link preloading a collectible, or undefined when its type has no dressing room slot (pets, deployables). */
export function collectibleDressingRoomHref(row: Pick<CollectibleDesc, "id" | "collectibleType">): string | undefined {
    const slot = row.collectibleType.tag;
    return DRESSING_ROOM_SLOTS.has(slot) ? dressingRoomHref({[slot]: row.id}) : undefined;
}

const HAIR_MESH_BY_MASK: Record<ClothingMask["tag"], HairMesh> = {
    None: "default",
    HairFront: "front",
    HairBottom: "bottom",
    HairFull: "full",
    Bald: "none",
};

export interface CharacterSelection {
    slots: Partial<Record<ModelSlot, CollectibleDesc>>;
    bodyColor?: CollectibleDesc;
    hairColor?: CollectibleDesc;
    maskPattern?: CollectibleDesc;
    /** Hand item model paths (`prefab_names`) and which one is shown. */
    tool?: { paths: string[]; index: number };
}

/**
 * Builds the viewer's parts and tints for a character. Slots with no published model (e.g. the
 * default belt and cape, which draw nothing) are skipped.
 */
export function characterModel(
    sel: CharacterSelection,
    headMask: (headCollectibleId: number) => ClothingMask["tag"] | undefined,
): { parts: ModelPart[]; tints: ModelTints } {
    const hairMesh = HAIR_MESH_BY_MASK[headMask(sel.slots.ClothesHead?.id ?? -1) ?? "None"];
    const parts: ModelPart[] = [];
    for (const slot of MODEL_SLOTS) {
        const row = sel.slots[slot];
        const path = row ? customizationPath(row) : DEFAULTED_SLOTS.has(slot) ? `Customization/Default/${slot}` : undefined;
        if (!path || !hasModel(path)) continue;
        // The HairColor row picks the hair material variant; other slots use their own row's.
        const variant = slot === "Hair" && sel.hairColor ? sel.hairColor.variant : row?.variant ?? 0;
        parts.push({id: slot, path, variant, ...(slot === "Hair" ? {hairMesh} : {})});
    }
    const toolPath = sel.tool?.paths[sel.tool.index];
    if (toolPath && hasModel(toolPath)) parts.push({id: "Tool", path: toolPath});
    return {
        parts,
        tints: {bodyColor: sel.bodyColor, hairColor: sel.hairColor, maskPattern: sel.maskPattern},
    };
}

/** The Hair collectible a hair color is shown on (the default head is bald). */
export const HAIR_COLOR_PREVIEW_STYLE = 99;

/**
 * Parts and tints previewing a HairColor collectible: the default head wearing `style`. Undefined
 * when `style` isn't a hair style with a model.
 */
export function hairColorPreview(color: CollectibleDesc, style: CollectibleDesc | undefined): { parts: ModelPart[]; tints: ModelTints } | undefined {
    if (style?.collectibleType.tag !== "Hair" || !customizationPath(style)) return undefined;
    const {parts, tints} = characterModel({slots: {Hair: style}, hairColor: color}, () => undefined);
    return {parts: parts.filter(p => p.id === "ClothesHead" || p.id === "Hair"), tints};
}
