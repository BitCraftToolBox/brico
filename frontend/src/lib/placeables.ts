/**
 * Placeables — Shared lookup helpers for placeable data.
 *
 * Provides memoized maps for:
 *   - Group membership (placeableId → PlaceableGroupDesc)
 *   - Placements by placeable (placedPlaceableId → PlaceablePlacementDesc[])
 *   - Growth by placeable (placeableId → PlaceableGrowthDesc)
 *   - Interactions by placeable (placeableId → PlaceableInteractionDesc[])
 */

import {createMemo} from "solid-js";
import {PlaceableGroupDesc} from "~/bindings/src/placeable_group_desc_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {BitCraftTables} from "~/lib/spacetime";

// ─── Group Lookup ───────────────────────────────────────────────

/** Builds a map: placeableId → PlaceableGroupDesc[] (a placeable could be in multiple groups) */
export function useGroupsByPlaceable() {
    return createMemo(() => {
        const groups = BitCraftTables.PlaceableGroupDesc.get() ?? [];
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
}

// ─── Placement Lookup ───────────────────────────────────────────

/** Builds a map: placedPlaceableId → PlaceablePlacementDesc[] */
export function usePlacementsByPlaceable() {
    return createMemo(() => {
        const all = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
        const map = new Map<number, PlaceablePlacementDesc[]>();
        for (const p of all) {
            const arr = map.get(p.placedPlaceableId);
            if (arr) arr.push(p);
            else map.set(p.placedPlaceableId, [p]);
        }
        return map;
    });
}

/** Finds placements where inputItem matches a given item */
export function placementsConsumingItem(itemId: number, itemType: string): PlaceablePlacementDesc[] {
    const all = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
    return all.filter(p => p.inputItem.itemId === itemId && p.inputItem.itemType.tag === itemType);
}

// ─── Growth Lookup ──────────────────────────────────────────────

/** Builds a map: placeableId → PlaceableGrowthDesc (the growth record for that placeable) */
export function useGrowthByPlaceable() {
    return createMemo(() => {
        const all = BitCraftTables.PlaceableGrowthDesc.get() ?? [];
        const map = new Map<number, PlaceableGrowthDesc>();
        for (const g of all) {
            map.set(g.placeableId, g);
        }
        return map;
    });
}

/** Builds a map: outcomeId → PlaceableGrowthDesc[] (all growths that can produce this placeable as an outcome) */
export function useGrowthByOutcome() {
    return createMemo(() => {
        const all = BitCraftTables.PlaceableGrowthDesc.get() ?? [];
        const map = new Map<number, PlaceableGrowthDesc[]>();
        for (const g of all) {
            for (const outcome of g.outcomes) {
                const arr = map.get(outcome.placeableId);
                if (arr) arr.push(g);
                else map.set(outcome.placeableId, [g]);
            }
        }
        return map;
    });
}

// ─── Interaction Lookup ─────────────────────────────────────────

/** Builds a map: placeableId → PlaceableInteractionDesc[] */
export function useInteractionsByPlaceable() {
    return createMemo(() => {
        const all = BitCraftTables.PlaceableInteractionDesc.get() ?? [];
        const map = new Map<number, PlaceableInteractionDesc[]>();
        for (const ia of all) {
            const arr = map.get(ia.placeableId);
            if (arr) arr.push(ia);
            else map.set(ia.placeableId, [ia]);
        }
        return map;
    });
}

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
            if (g.outcomes.some(o => o.placeableId === current) && !visited.has(g.placeableId)) {
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
    return BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(placeableId)?.name ?? `Placeable #${placeableId}`;
}

export function getPlacementName(p: PlaceablePlacementDesc): string {
    const plcName = getPlaceableName(p.placedPlaceableId);
    return `Place ${plcName}`;
}

export function getInteractionName(ia: PlaceableInteractionDesc): string {
    const plcName = getPlaceableName(ia.placeableId);
    return `${ia.verbPhrase} (${plcName})`;
}
