/**
 * Placeables — Shared lookup helpers for placeable data.
 *
 * Provides cached maps for:
 *   - Group membership (placeableId → PlaceableGroupDesc[])
 *   - Placements by placeable (placedPlaceableId → PlaceablePlacementDesc[])
 *   - Growth by placeable (placeableId → PlaceableGrowthDesc)
 *   - Interactions by placeable (placeableId → PlaceableInteractionDesc[])
 *
 * Each is a single module-scope accessor built with `derivedTableLookup`, rebuilt only when its
 * table's rows change identity. Read the doc comment there before touching this: these used to be
 * `use*()` factories that minted a fresh `createMemo` per caller, so every component rebuilt the
 * same map — and any attempt to share one lazily (as placeables-table.tsx did) produced a memo
 * owned by whichever component rendered first, silently frozen from its unmount onward.
 */

import {t} from "@lingui/core/macro";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {PlaceableGroupDesc} from "~/bindings/src/placeable_group_desc_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {trackUILocale} from "~/lib/i18n";
import {BitCraftTables, derivedTableLookup} from "~/lib/spacetime";

// ─── Group Lookup ───────────────────────────────────────────────

/** placeableId → PlaceableGroupDesc[] (a placeable can be in multiple groups) */
export const groupsByPlaceable = derivedTableLookup(BitCraftTables.PlaceableGroupDesc, groups => {
    const map = new Map<number, PlaceableGroupDesc[]>();
    for (const g of groups) {
        for (const pid of g.placeableIds) {
            const arr = map.get(pid);
            if (arr) arr.push(g);
            else map.set(pid, [g]);
        }
    }
    return map;
});

// ─── Placement Lookup ───────────────────────────────────────────

/** placedPlaceableId → PlaceablePlacementDesc[] */
export const placementsByPlaceable = derivedTableLookup(BitCraftTables.PlaceablePlacementDesc, all => {
    const map = new Map<number, PlaceablePlacementDesc[]>();
    for (const p of all) {
        const arr = map.get(p.placedPlaceableId);
        if (arr) arr.push(p);
        else map.set(p.placedPlaceableId, [p]);
    }
    return map;
});

/** Finds placements where inputItem matches a given item */
export function placementsConsumingItem(itemId: number, itemType: string): PlaceablePlacementDesc[] {
    const all = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
    return all.filter(p => p.inputItem.itemId === itemId && p.inputItem.itemType.tag === itemType);
}

// ─── Growth Lookup ──────────────────────────────────────────────

/** placeableId → PlaceableGrowthDesc (the growth record for that placeable) */
export const growthByPlaceable = derivedTableLookup(BitCraftTables.PlaceableGrowthDesc, all => {
    const map = new Map<number, PlaceableGrowthDesc>();
    for (const g of all) {
        map.set(g.placeableId, g);
    }
    return map;
});

/** outcomeId → PlaceableGrowthDesc[] (all growths that can produce this placeable as an outcome) */
export const growthByOutcome = derivedTableLookup(BitCraftTables.PlaceableGrowthDesc, all => {
    const map = new Map<number, PlaceableGrowthDesc[]>();
    for (const g of all) {
        for (const outcome of g.outcomesV2 ?? []) {
            const arr = map.get(outcome.placeableId);
            if (arr) arr.push(g);
            else map.set(outcome.placeableId, [g]);
        }
    }
    return map;
});

// ─── Extraction Lookup ─────────────────────────────────────────

/** placeableId → ExtractionRecipeDesc[] (extractions that spawn this placeable) */
export const extractionsByPlaceable = derivedTableLookup(BitCraftTables.ExtractionRecipeDesc, all => {
    const map = new Map<number, ExtractionRecipeDesc[]>();
    for (const ext of all) {
        if (!ext.spawnedPlaceables?.length) continue;
        for (const esp of ext.spawnedPlaceables) {
            const pid = esp.placeableId;
            const arr = map.get(pid);
            if (arr) arr.push(ext);
            else map.set(pid, [ext]);
        }
    }
    return map;
});

// ─── Interaction Lookup ─────────────────────────────────────────

/** placeableId → PlaceableInteractionDesc[] (interactions performed on that placeable) */
export const interactionsByPlaceable = derivedTableLookup(BitCraftTables.PlaceableInteractionDesc, all => {
    const map = new Map<number, PlaceableInteractionDesc[]>();
    for (const ia of all) {
        const arr = map.get(ia.placeableId);
        if (arr) arr.push(ia);
        else map.set(ia.placeableId, [ia]);
    }
    return map;
});

/** outcomePlaceableId → PlaceableInteractionDesc[] (interactions that spawn this placeable when their target is destroyed) */
export const interactionsByOutcome = derivedTableLookup(BitCraftTables.PlaceableInteractionDesc, all => {
    const map = new Map<number, PlaceableInteractionDesc[]>();
    for (const ia of all) {
        if (ia.onDestroySpawnedPlaceableId) {
            const arr = map.get(ia.onDestroySpawnedPlaceableId);
            if (arr) arr.push(ia);
            else map.set(ia.onDestroySpawnedPlaceableId, [ia]);
        }
        for (const outcome of ia.onDestroyOutcomes ?? []) {
            const arr = map.get(outcome.placeableId);
            if (arr) arr.push(ia);
            else map.set(outcome.placeableId, [ia]);
        }
    }
    return map;
});

/** Finds interactions where the given item appears in either consumedItemStacks or outputItemStacks */
export function interactionsInvolvingItem(itemId: number, itemType: string): PlaceableInteractionDesc[] {
    const all = BitCraftTables.PlaceableInteractionDesc.get() ?? [];
    return all.filter(ia =>
        ia.consumedItemStacks.some(s => s.itemId === itemId && s.itemType.tag === itemType) ||
        ia.outputItemStacks.some(s => s.itemId === itemId && s.itemType.tag === itemType)
    );
}

// ─── Root Placement Finder ──────────────────────────────────────

/**
 * Traces backwards from a given placeableId through growth outcomes and interaction spawns
 * to find a "root" PlaceablePlacementDesc (one that is directly placed).
 * Returns undefined if no root is found or if this placeable IS directly placed.
 */
export function findRootPlacement(placeableId: number): PlaceablePlacementDesc | undefined {
    const placements = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
    const growths = BitCraftTables.PlaceableGrowthDesc.get() ?? [];
    const interactions = BitCraftTables.PlaceableInteractionDesc.get() ?? [];

    // Check if this is directly placed
    const directPlacement = placements.find(p => p.placedPlaceableId === placeableId);
    if (directPlacement) return undefined; // it IS the root

    // BFS backwards
    const visited = new Set<number>();
    const queue = [placeableId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        // Check growth outcomes that produce this placeable
        for (const g of growths) {
            if (g.outcomesV2?.some(o => o.placeableId === current) && !visited.has(g.placeableId)) {
                const p = placements.find(pp => pp.placedPlaceableId === g.placeableId);
                if (p) return p;
                queue.push(g.placeableId);
            }
        }

        // Check interactions that spawn this placeable
        for (const ia of interactions) {
            if (ia.onDestroySpawnedPlaceableId === current && ia.onDestroySpawnedPlaceableId !== 0 && !visited.has(ia.placeableId)) {
                const p = placements.find(pp => pp.placedPlaceableId === ia.placeableId);
                if (p) return p;
                queue.push(ia.placeableId);
            }
        }
    }

    return undefined;
}

// ─── Naming Helpers ─────────────────────────────────────────────

export function getPlaceableName(placeableId: number): string {
    return BitCraftTables.PlaceableDesc.indexedBy("id")().get(placeableId)?.name ?? `Placeable #${placeableId}`;
}

// App-authored templates around game-string values — see the note in relations.ts's
// getTravelerTradeName for why these use named `t` interpolation rather than concatenation.
// `trackUILocale()` because the bare `t` macro compiles to a read of the module-global i18n
// instance, which no computation subscribes to; without it these names would keep the previous
// wording after a UI locale change until something else invalidated the caller.
export function getPlacementName(p: PlaceablePlacementDesc): string {
    trackUILocale();
    const plcName = getPlaceableName(p.placedPlaceableId);
    return t`Place ${plcName}`;
}

export function getInteractionName(ia: PlaceableInteractionDesc): string {
    trackUILocale();
    const targetName = getPlaceableName(ia.placeableId);
    const verbPhrase = ia.verbPhrase;
    // same as getExtractionRecipeName
    return t`${verbPhrase} ${targetName}`;
}
