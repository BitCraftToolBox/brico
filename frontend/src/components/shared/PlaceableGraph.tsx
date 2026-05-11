/**
 * PlaceableGraph — SVG graph visualizing placeable lifecycle chains.
 *
 * Layout: left-to-right layered (items on left, placeables in middle columns, terminal items on right).
 * Uses d3-zoom for pan/zoom, same infrastructure as cereal's RefGraph.
 *
 * Nodes: GameIcon components rendered via foreignObject, clickable.
 * Edges: placement (item→placeable), growth (placeable→placeable, self-loops), interaction (placeable→item/placeable).
 * Edge labels always visible for growth (probability/time) and interaction (verb phrase).
 *
 * Edges that span multiple columns with intermediate nodes are routed around them
 * using cubic bezier detour paths (backward edges below, forward edges above).
 */

import * as d3Selection from "d3-selection";
import * as d3Zoom from "d3-zoom";
import {TbOutlineArrowBarRight as IconStart, TbOutlineArrowBarToRight as IconEnd, TbOutlineArrowGuide as IconPath} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from "solid-js";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {CargoIcon, ItemIcon, PlaceableIcon} from "~/components/shared/GameIcon";
import {useGrowthByPlaceable, useInteractionsByPlaceable} from "~/lib/placeables";
import {BitCraftTables} from "~/lib/spacetime";
import {readableSeconds} from "~/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

export interface PlaceableGraphNode {
    id: string;
    label: string;
    type: "item" | "placeable";
    /** The game object ID for looking up the desc */
    gameId: number;
    /** Item type tag (e.g. "Item", "Cargo") — only for item nodes */
    itemType?: string;
    column: number;
    /** If this is an item node that starts a placement, the placement id */
    placementId?: number;
    /** For navigation */
    detailHref: string;
}

export interface PlaceableGraphEdge {
    source: string;
    target: string;
    label: string;
    edgeType: "placement" | "growth" | "interaction";
    isSelfLoop?: boolean;
    /** Tooltip for interaction hover */
    tooltip?: string;
}

export interface PlaceableGraphProps {
    nodes: PlaceableGraphNode[];
    edges: PlaceableGraphEdge[];
    onNavigate: (href: string) => void;
    onPlacementSelect?: (placementId: number) => void;
}

// ─── Sizing ─────────────────────────────────────────────────────

const NODE_W = 80;
const NODE_H = 90;
const COL_GAP = 280;
const ROW_GAP = 120;

const EDGE_COLORS = {
    placement: "hsl(200 70% 55%)",
    growth: "hsl(130 60% 45%)",
    interaction: "hsl(35 80% 55%)",
};

// ─── Layout ─────────────────────────────────────────────────────

function computeLayout(nodes: PlaceableGraphNode[], w: number, h: number): Map<string, { x: number; y: number }> {
    const pos = new Map<string, { x: number; y: number }>();

    // Group nodes by column
    const columns = new Map<number, PlaceableGraphNode[]>();
    for (const n of nodes) {
        const arr = columns.get(n.column);
        if (arr) arr.push(n);
        else columns.set(n.column, [n]);
    }

    const sortedCols = [...columns.keys()].sort((a, b) => a - b);
    const totalCols = sortedCols.length;

    for (let ci = 0; ci < totalCols; ci++) {
        const col = sortedCols[ci];
        const group = columns.get(col)!;
        const x = w / 2 + (ci - (totalCols - 1) / 2) * COL_GAP;
        const totalH = (group.length - 1) * ROW_GAP;
        group.forEach((n, i) => {
            pos.set(n.id, {x, y: h / 2 - totalH / 2 + i * ROW_GAP});
        });
    }

    return pos;
}

// ─── Edge Routing ───────────────────────────────────────────────

interface RoutedEdge {
    index: number;
    d: string;
    mid: { x: number; y: number };
    label: string;
    tooltip?: string;
    edgeType: string;
    isSelfLoop?: boolean;
}

/**
 * Compute perpendicular offsets for edges sharing the same source/target pair.
 * Only used for direct (non-detour) edges.
 *
 * Accounts for direction: when A→B and B→A share a pair, the perpendicular
 * normal flips, so reversed edges get their offset negated to ensure they
 * visually curve in opposite directions.
 */
function computeEdgeOffsets(edges: PlaceableGraphEdge[]): number[] {
    const pairMap = new Map<string, { indices: number[]; canonicalSource: string }>();
    const offsets = new Array<number>(edges.length).fill(0);

    for (let i = 0; i < edges.length; i++) {
        if (edges[i].isSelfLoop) continue;
        const [a, b] = [edges[i].source, edges[i].target].sort();
        const key = `${a}|${b}`;
        const entry = pairMap.get(key);
        if (entry) entry.indices.push(i);
        else pairMap.set(key, {indices: [i], canonicalSource: a});
    }

    for (const {indices, canonicalSource} of pairMap.values()) {
        if (indices.length <= 1) continue;
        const mid = (indices.length - 1) / 2;
        for (let j = 0; j < indices.length; j++) {
            const idx = indices[j];
            let offset = (j - mid) * 30;
            // Negate offset for reversed edges so perpendicular flip
            // produces opposite visual curvature
            if (edges[idx].source !== canonicalSource) offset = -offset;
            offsets[idx] = offset;
        }
    }

    return offsets;
}

/** Direct edge: quadratic bezier with perpendicular offset */
function directPath(sx: number, sy: number, tx: number, ty: number, offset: number): string {
    const hw = NODE_W / 2;
    const dx = tx - sx;
    const x1 = dx >= 0 ? sx + hw : sx - hw;
    const x2 = dx >= 0 ? tx - hw : tx + hw;

    if (Math.abs(offset) < 1 && Math.abs(ty - sy) < 1) {
        return `M ${x1} ${sy} L ${x2} ${ty}`;
    }

    const midX = (x1 + x2) / 2;
    const midY = (sy + ty) / 2;
    const len = Math.sqrt((x2 - x1) ** 2 + (ty - sy) ** 2) || 1;
    const nx = -(ty - sy) / len;
    const ny = (x2 - x1) / len;
    const cx = midX + nx * offset;
    const cy = midY + ny * offset;

    return `M ${x1} ${sy} Q ${cx} ${cy}, ${x2} ${ty}`;
}

function directMidpoint(sx: number, sy: number, tx: number, ty: number, offset: number): { x: number; y: number } {
    const hw = NODE_W / 2;
    const dx = tx - sx;
    const x1 = dx >= 0 ? sx + hw : sx - hw;
    const x2 = dx >= 0 ? tx - hw : tx + hw;
    const midX = (x1 + x2) / 2;
    const midY = (sy + ty) / 2;

    if (Math.abs(offset) < 1) return {x: midX, y: midY};

    const len = Math.sqrt((x2 - x1) ** 2 + (ty - sy) ** 2) || 1;
    const nx = -(ty - sy) / len;
    const ny = (x2 - x1) / len;
    return {x: midX + nx * offset * 0.5, y: midY + ny * offset * 0.5};
}

/**
 * Detour edge: smooth cubic bezier path that routes around intermediate column nodes.
 *
 * For backward edges (target to the left), the path goes BELOW the graph.
 * For forward edges (target to the right), the path goes ABOVE.
 *
 * Shape: exit horizontally from source → cubic curve down/up to detour Y →
 *        horizontal segment at detour Y → cubic curve up/down into target
 *
 * The cubic bezier control points ensure:
 *   - Start tangent exits horizontally from the source node
 *   - End tangent enters horizontally into the target node
 *   - Transitions between vertical and horizontal are smooth
 */
function detourPath(
    srcX: number, srcY: number,
    tgtX: number, tgtY: number,
    detourY: number,
    isBackward: boolean,
): { d: string; mid: { x: number; y: number } } {
    const hw = NODE_W / 2;
    const pad = 35;

    // Exit/entry points on node edges
    const exitX = isBackward ? srcX - hw : srcX + hw;
    const entryX = isBackward ? tgtX + hw : tgtX - hw;

    // Extended points for smooth turns
    const startX = isBackward ? exitX - pad : exitX + pad;
    const endX = isBackward ? entryX + pad : entryX - pad;

    // Cubic 1: exit horizontally → curve to detour level arriving horizontally
    // C1 = (startX, srcY) — tangent goes outward horizontally
    // C2 = (exitX, detourY) — tangent approaches detour level, arriving horizontally
    // End = (startX, detourY)
    //
    // Cubic 2: from detour level → curve up/down to target arriving horizontally
    // C1 = (entryX, detourY) — tangent departs horizontally
    // C2 = (endX, tgtY) — tangent approaches target horizontally
    // End = (entryX, tgtY)
    const d = [
        `M ${exitX} ${srcY}`,
        `C ${startX} ${srcY}, ${exitX} ${detourY}, ${startX} ${detourY}`,
        `L ${endX} ${detourY}`,
        `C ${entryX} ${detourY}, ${endX} ${tgtY}, ${entryX} ${tgtY}`,
    ].join(" ");

    const mid = {
        x: (startX + endX) / 2,
        y: detourY,
    };

    return {d, mid};
}

/**
 * Compute all routed edges. Edges spanning multiple columns with intermediate
 * nodes get detour paths; others get direct quadratic bezier curves.
 * Self-loops get an arc path above the node.
 */
function computeRoutedEdges(
    edges: PlaceableGraphEdge[],
    nodes: PlaceableGraphNode[],
    positions: Map<string, { x: number; y: number }>,
): RoutedEdge[] {
    const hh = NODE_H / 2;
    const hw = NODE_W / 2;

    // Build column lookup
    const nodeColMap = new Map<string, number>();
    for (const n of nodes) nodeColMap.set(n.id, n.column);

    // Group node positions by column
    const nodesByCol = new Map<number, { x: number; y: number }[]>();
    for (const n of nodes) {
        const pos = positions.get(n.id);
        if (!pos) continue;
        const arr = nodesByCol.get(n.column);
        if (arr) arr.push(pos);
        else nodesByCol.set(n.column, [pos]);
    }

    // Pair offsets for direct edges
    const pairOffsets = computeEdgeOffsets(edges);

    const result: RoutedEdge[] = [];
    let detourBelowIndex = 0;
    let detourAboveIndex = 0;

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const src = positions.get(e.source);
        if (!src) continue;

        if (e.isSelfLoop) {
            // Arc above the node
            const ax = src.x;
            const ay = src.y;
            const d = `M ${ax - hw * 0.4} ${ay - hh} C ${ax - hw * 1.5} ${ay - hh * 3}, ${ax + hw * 1.5} ${ay - hh * 3}, ${ax + hw * 0.4} ${ay - hh}`;
            const mid = {x: ax, y: ay - hh * 3.15};
            result.push({index: i, d, mid, label: e.label, tooltip: e.tooltip, edgeType: e.edgeType, isSelfLoop: true});
            continue;
        }

        const tgt = positions.get(e.target);
        if (!tgt) continue;

        const srcCol = nodeColMap.get(e.source) ?? 0;
        const tgtCol = nodeColMap.get(e.target) ?? 0;
        const minCol = Math.min(srcCol, tgtCol);
        const maxCol = Math.max(srcCol, tgtCol);

        // Check if any intermediate columns have nodes
        let hasIntermediate = false;
        if (maxCol - minCol > 1) {
            for (let c = minCol + 1; c < maxCol; c++) {
                if (nodesByCol.has(c)) {
                    hasIntermediate = true;
                    break;
                }
            }
        }

        if (!hasIntermediate) {
            // Direct edge with pair offset
            const offset = pairOffsets[i];
            const d = directPath(src.x, src.y, tgt.x, tgt.y, offset);
            const mid = directMidpoint(src.x, src.y, tgt.x, tgt.y, offset);
            result.push({index: i, d, mid, label: e.label, tooltip: e.tooltip, edgeType: e.edgeType});
        } else {
            // Detour edge: route around intermediate nodes
            const isBackward = tgtCol < srcCol;

            // Find Y extent of intermediate column nodes (plus source and target)
            let extentMinY = Math.min(src.y - hh, tgt.y - hh);
            let extentMaxY = Math.max(src.y + hh, tgt.y + hh);
            for (let c = minCol + 1; c < maxCol; c++) {
                const colNodes = nodesByCol.get(c);
                if (!colNodes) continue;
                for (const p of colNodes) {
                    extentMinY = Math.min(extentMinY, p.y - hh);
                    extentMaxY = Math.max(extentMaxY, p.y + hh);
                }
            }

            // Stack multiple detour edges at different Y levels
            const detourLevel = isBackward ? detourBelowIndex++ : detourAboveIndex++;
            const detourPad = 50 + detourLevel * 30;
            const detourY = isBackward
                ? extentMaxY + detourPad
                : extentMinY - detourPad;

            const {d, mid} = detourPath(src.x, src.y, tgt.x, tgt.y, detourY, isBackward);
            result.push({index: i, d, mid, label: e.label, tooltip: e.tooltip, edgeType: e.edgeType});
        }
    }

    return result;
}

function splitLabel(label: string, maxChars: number = 18): string[] {
    if (label.length <= maxChars) return [label];
    const words = label.split(/[ _]+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
        const seg = cur ? `${cur} ${w}` : w;
        if (seg.length > maxChars && cur) {
            lines.push(cur);
            cur = w;
        } else cur = seg;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
}

// ─── Path Calculator (Markov chain solver) ──────────────────────

export interface PathResult {
    expectedTime: number;
    itemCosts: { itemId: number; itemType: string; name: string; expectedQuantity: number }[];
}

/**
 * Traces from a placeable through instant (user-driven) interactions until
 * reaching a growth state or the end node.
 * Returns the next "waiting" state and accumulated item costs along the way.
 */
function traceInstant(
    placeableId: number,
    endId: string,
    distToEnd: Map<string, number>,
    interactionsByPlaceable: Map<number, PlaceableInteractionDesc[]>,
    growthByPlaceable: Map<number, PlaceableGrowthDesc>,
    visited: Set<number>,
): { state: number | "done"; costs: { itemId: number; itemType: string; quantity: number }[] } {
    const nodeId = `placeable-${placeableId}`;
    if (nodeId === endId) return {state: "done", costs: []};
    if (visited.has(placeableId)) return {state: placeableId, costs: []};
    visited.add(placeableId);

    // If this placeable has growth, it's a waiting state — stop here
    if (growthByPlaceable.has(placeableId)) return {state: placeableId, costs: []};

    // No growth: find the interaction that progresses closest to end
    const interactions = interactionsByPlaceable.get(placeableId) ?? [];
    let bestIa: PlaceableInteractionDesc | null = null;
    let bestTarget: { type: "placeable"; id: number } | { type: "item"; nodeId: string } | null = null;
    let bestDist = Infinity;

    for (const ia of interactions) {
        if (ia.onDestroySpawnedPlaceableId && ia.onDestroySpawnedPlaceableId !== 0) {
            const d = distToEnd.get(`placeable-${ia.onDestroySpawnedPlaceableId}`);
            if (d !== undefined && d < bestDist) {
                bestDist = d; bestIa = ia;
                bestTarget = {type: "placeable", id: ia.onDestroySpawnedPlaceableId};
            }
        }
        for (const output of ia.outputItemStacks) {
            const outKey = `${output.itemType.tag}-${output.itemId}`;
            const d = distToEnd.get(outKey);
            if (d !== undefined && d < bestDist) {
                bestDist = d; bestIa = ia;
                bestTarget = {type: "item", nodeId: outKey};
            }
        }
    }

    if (!bestIa || !bestTarget) return {state: placeableId, costs: []};

    const iaCosts = bestIa.consumedItemStacks.map(s => ({
        itemId: s.itemId, itemType: s.itemType.tag, quantity: s.quantity,
    }));

    if (bestTarget.type === "item") {
        return {state: "done", costs: iaCosts};
    }

    // Spawns a placeable → continue tracing
    const next = traceInstant(
        bestTarget.id, endId, distToEnd,
        interactionsByPlaceable, growthByPlaceable, visited,
    );
    return {state: next.state, costs: [...iaCosts, ...next.costs]};
}

/** Gaussian elimination for small systems (I-P)E = b */
function solveLinearSystem(coeffs: number[][], constants: number[]): number[] | null {
    const n = coeffs.length;
    if (n === 0) return [];
    const aug = coeffs.map((row, i) => [...row, constants[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
        }
        if (Math.abs(aug[pivot][col]) < 1e-12) return null;
        [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
        for (let row = col + 1; row < n; row++) {
            const f = aug[row][col] / aug[col][col];
            for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
        }
    }
    const result = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let s = aug[i][n];
        for (let j = i + 1; j < n; j++) s -= aug[i][j] * result[j];
        result[i] = s / aug[i][i];
    }
    return result;
}

/**
 * Compute the expected time and item costs to go from startId to endId.
 *
 * Assumptions:
 *   1) The user performs required interactions instantly (no delay).
 *   2) The user never intentionally regresses (e.g. won't pick up and re-place).
 *
 * Algorithm:
 *   - Identify placeables with growth as Markov chain states.
 *   - For each growth outcome, trace through instant interactions
 *     to find the next growth state or the terminal state ("done").
 *   - Solve (I − P)E = t via Gaussian elimination for expected time.
 *   - Solve the same system structure for each item cost independently.
 */
export function computeExpectedPath(
    startId: string,
    endId: string,
    graphNodes: PlaceableGraphNode[],
    graphEdges: PlaceableGraphEdge[],
): PathResult | null {
    if (startId === endId) return {expectedTime: 0, itemCosts: []};

    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargoIndex = BitCraftTables.CargoDesc.indexedBy("id")();
    const growthAll = BitCraftTables.PlaceableGrowthDesc.get() ?? [];
    const interactionAll = BitCraftTables.PlaceableInteractionDesc.get() ?? [];
    const placementAll = BitCraftTables.PlaceablePlacementDesc.get() ?? [];

    const growthByPlaceable = new Map<number, PlaceableGrowthDesc>();
    for (const g of growthAll) growthByPlaceable.set(g.placeableId, g);

    const interactionsByPlaceable = new Map<number, PlaceableInteractionDesc[]>();
    for (const ia of interactionAll) {
        const arr = interactionsByPlaceable.get(ia.placeableId);
        if (arr) arr.push(ia);
        else interactionsByPlaceable.set(ia.placeableId, [ia]);
    }

    // ── Reverse BFS from end to compute reachability + distance ──
    const reverseAdj = new Map<string, Set<string>>();
    for (const e of graphEdges) {
        if (e.isSelfLoop) continue;
        const set = reverseAdj.get(e.target);
        if (set) set.add(e.source);
        else reverseAdj.set(e.target, new Set([e.source]));
    }

    const distToEnd = new Map<string, number>();
    const bfsQ: string[] = [endId];
    distToEnd.set(endId, 0);
    while (bfsQ.length > 0) {
        const cur = bfsQ.shift()!;
        const d = distToEnd.get(cur)!;
        for (const prev of reverseAdj.get(cur) ?? []) {
            if (!distToEnd.has(prev)) {
                distToEnd.set(prev, d + 1);
                bfsQ.push(prev);
            }
        }
    }
    if (!distToEnd.has(startId)) return null;

    const startNode = graphNodes.find(n => n.id === startId);
    const endNode = graphNodes.find(n => n.id === endId);
    if (!startNode || !endNode) return null;

    // ── Initial step (placement if starting from an item) ──
    let initialTime = 0;
    let initialCosts: { itemId: number; itemType: string; quantity: number }[] = [];
    let firstPlaceableId: number;

    if (startNode.type === "item") {
        const pp = placementAll.find(p =>
            p.inputItem.itemId === startNode.gameId &&
            p.inputItem.itemType.tag === (startNode.itemType ?? "Item")
        );
        if (!pp) return null;
        initialTime = pp.requiredTime;
        initialCosts = [{
            itemId: pp.inputItem.itemId,
            itemType: pp.inputItem.itemType.tag,
            quantity: pp.inputItem.quantity,
        }];
        firstPlaceableId = pp.placedPlaceableId;
    } else {
        firstPlaceableId = startNode.gameId;
    }

    // Trace from first placeable to the first growth state (or done)
    const startTrace = traceInstant(
        firstPlaceableId, endId, distToEnd,
        interactionsByPlaceable, growthByPlaceable, new Set(),
    );
    initialCosts = [...initialCosts, ...startTrace.costs];

    if (startTrace.state === "done") {
        // No growth waiting needed — just instant interactions
        return {
            expectedTime: initialTime,
            itemCosts: aggregateItemCosts(initialCosts, itemIndex, cargoIndex),
        };
    }

    const entryState = startTrace.state as number;

    // ── Discover all growth states reachable from entry ──
    const stateIds: number[] = [];
    const stateSet = new Set<number>();

    interface TransitionInfo {
        targetIdx: number | "done"; // index into stateIds, or "done"
        probability: number;
        costs: { itemId: number; itemType: string; quantity: number }[];
    }

    // First pass: discover states via BFS
    const discoverQ: number[] = [entryState];
    while (discoverQ.length > 0) {
        const plcId = discoverQ.shift()!;
        if (stateSet.has(plcId)) continue;
        stateSet.add(plcId);
        stateIds.push(plcId);

        const growth = growthByPlaceable.get(plcId);
        if (!growth) continue;

        for (const outcome of growth.outcomes) {
            if (outcome.placeableId === plcId) continue;
            const trace = traceInstant(
                outcome.placeableId, endId, distToEnd,
                interactionsByPlaceable, growthByPlaceable, new Set(),
            );
            if (trace.state !== "done" && typeof trace.state === "number" && !stateSet.has(trace.state)) {
                discoverQ.push(trace.state);
            }
        }
    }

    const n = stateIds.length;
    const stateIndex = new Map<number, number>();
    for (let i = 0; i < n; i++) stateIndex.set(stateIds[i], i);

    // ── Build transition table for each state ──
    const stateTransitions: TransitionInfo[][] = [];
    const stateMeanTimes: number[] = [];

    for (const plcId of stateIds) {
        const growth = growthByPlaceable.get(plcId);
        if (!growth) {
            stateTransitions.push([]);
            stateMeanTimes.push(0);
            continue;
        }

        const totalWeight = growth.outcomes.reduce((s, o) => s + o.probability, 0);
        const meanTime = ((growth.time[0] ?? 0) + (growth.time[1] ?? growth.time[0] ?? 0)) / 2;
        stateMeanTimes.push(meanTime);

        const transitions: TransitionInfo[] = [];
        for (const outcome of growth.outcomes) {
            const prob = outcome.probability / totalWeight;
            if (outcome.placeableId === plcId) {
                transitions.push({targetIdx: stateIndex.get(plcId)!, probability: prob, costs: []});
                continue;
            }
            const trace = traceInstant(
                outcome.placeableId, endId, distToEnd,
                interactionsByPlaceable, growthByPlaceable, new Set(),
            );
            if (trace.state === "done") {
                transitions.push({targetIdx: "done", probability: prob, costs: trace.costs});
            } else {
                const idx = stateIndex.get(trace.state as number);
                transitions.push({
                    targetIdx: idx ?? stateIndex.get(plcId)!,
                    probability: prob,
                    costs: trace.costs,
                });
            }
        }
        stateTransitions.push(transitions);
    }

    // ── Solve for expected time: (I − P)E = t ──
    const coeffs = Array.from({length: n}, () => new Array(n).fill(0));
    const timeConst = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        coeffs[i][i] = 1;
        timeConst[i] = stateMeanTimes[i];
        for (const t of stateTransitions[i]) {
            if (t.targetIdx !== "done") coeffs[i][t.targetIdx as number] -= t.probability;
        }
    }

    const expectedTimes = solveLinearSystem(coeffs, timeConst);
    if (!expectedTimes) return null;

    const entryIdx = stateIndex.get(entryState);
    if (entryIdx === undefined) return null;

    // ── Solve for expected item costs (same matrix, different constants) ──
    const allItemKeys = new Set<string>();
    for (const ts of stateTransitions) for (const t of ts) for (const c of t.costs) allItemKeys.add(`${c.itemType}-${c.itemId}`);
    for (const c of initialCosts) allItemKeys.add(`${c.itemType}-${c.itemId}`);

    const expectedItemQty = new Map<string, number>();
    for (const key of allItemKeys) {
        const [iType, iIdStr] = key.split("-");
        const iId = parseInt(iIdStr, 10);

        const itemConst = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (const t of stateTransitions[i]) {
                const qty = t.costs
                    .filter(c => c.itemType === iType && c.itemId === iId)
                    .reduce((s, c) => s + c.quantity, 0);
                itemConst[i] += t.probability * qty;
            }
        }

        const solved = solveLinearSystem(coeffs.map(r => [...r]), itemConst);
        if (solved) {
            const fromInitial = initialCosts
                .filter(c => c.itemType === iType && c.itemId === iId)
                .reduce((s, c) => s + c.quantity, 0);
            expectedItemQty.set(key, fromInitial + solved[entryIdx]);
        }
    }

    // Also add initial-only items not involved in cycles
    for (const c of initialCosts) {
        const key = `${c.itemType}-${c.itemId}`;
        if (!expectedItemQty.has(key)) expectedItemQty.set(key, c.quantity);
    }

    const itemCosts: PathResult["itemCosts"] = [];
    for (const [key, qty] of expectedItemQty) {
        if (qty < 0.001) continue;
        const [iType, iIdStr] = key.split("-");
        const iId = parseInt(iIdStr, 10);
        const name = iType === "Cargo"
            ? cargoIndex?.get(iId)?.name ?? `Cargo #${iId}`
            : itemIndex?.get(iId)?.name ?? `Item #${iId}`;
        itemCosts.push({itemId: iId, itemType: iType, name, expectedQuantity: qty});
    }

    return {expectedTime: initialTime + expectedTimes[entryIdx], itemCosts};
}

function aggregateItemCosts(
    costs: { itemId: number; itemType: string; quantity: number }[],
    itemIndex: Map<number, any> | undefined,
    cargoIndex: Map<number, any> | undefined,
): PathResult["itemCosts"] {
    const map = new Map<string, number>();
    for (const c of costs) {
        const key = `${c.itemType}-${c.itemId}`;
        map.set(key, (map.get(key) ?? 0) + c.quantity);
    }
    return [...map.entries()].filter(([, q]) => q > 0.001).map(([key, qty]) => {
        const [iType, iIdStr] = key.split("-");
        const iId = parseInt(iIdStr, 10);
        const name = iType === "Cargo"
            ? cargoIndex?.get(iId)?.name ?? `Cargo #${iId}`
            : itemIndex?.get(iId)?.name ?? `Item #${iId}`;
        return {itemId: iId, itemType: iType, name, expectedQuantity: qty};
    });
}

// ─── Component ──────────────────────────────────────────────────

export function PlaceableGraph(props: PlaceableGraphProps) {
    let svgRef!: SVGSVGElement;
    let containerRef!: HTMLDivElement;

    const [dims, setDims] = createSignal({w: 900, h: 600});
    const [transformStr, setTransformStr] = createSignal("translate(0,0) scale(1)");
    const [hoveredEdge, setHoveredEdge] = createSignal<number | null>(null);
    const [hoveredNode, setHoveredNode] = createSignal<string | null>(null);

    // Path calculator state
    const [pathMode, setPathMode] = createSignal(false);
    const [pathStart, setPathStart] = createSignal<string | null>(null);
    const [pathEnd, setPathEnd] = createSignal<string | null>(null);

    createEffect(() => {
        if (!pathMode()) { setPathStart(null); setPathEnd(null); }
    });

    const pathResult = createMemo(() => {
        const s = pathStart(), e = pathEnd();
        if (!s || !e) return null;
        return computeExpectedPath(s, e, props.nodes, props.edges);
    });

    const pathStartLabel = () => {
        const id = pathStart();
        return id ? props.nodes.find(n => n.id === id)?.label : null;
    };
    const pathEndLabel = () => {
        const id = pathEnd();
        return id ? props.nodes.find(n => n.id === id)?.label : null;
    };

    const nodePositions = createMemo(() => {
        const {w, h} = dims();
        return computeLayout(props.nodes, w, h);
    });

    const routedEdges = createMemo(() =>
        computeRoutedEdges(props.edges, props.nodes, nodePositions())
    );

    // Lookup game objects for foreignObject icons
    const placeableIndex = () => BitCraftTables.PlaceableDesc.indexedBy("id")();
    const itemIndex = () => BitCraftTables.ItemDesc.indexedBy("id")();
    const cargoIndex = () => BitCraftTables.CargoDesc.indexedBy("id")();

    // Zoom/pan
    onMount(() => {
        const ro = new ResizeObserver(entries => {
            for (const en of entries) {
                const {width, height} = en.contentRect;
                setDims({w: width, h: height});
            }
        });
        ro.observe(containerRef);
        onCleanup(() => ro.disconnect());

        const svg = d3Selection.select(svgRef);
        const zoom = d3Zoom.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.15, 5])
            .on("zoom", event => setTransformStr(event.transform.toString()));
        svg.call(zoom as any);
        onCleanup(() => svg.on(".zoom", null));
    });

    return (
        <div
            ref={containerRef!}
            class="relative flex flex-col flex-1 min-h-0 rounded-lg border bg-background overflow-hidden"
            style="min-height: 500px"
        >
            {/* Legend */}
            <div class="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-background/90 border rounded-md px-3 py-2 text-xs text-muted-foreground pointer-events-none select-none">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-0.5" style={`background:${EDGE_COLORS.placement}`}/>
                    Placement
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-0.5" style={`background:${EDGE_COLORS.growth}`}/>
                    Growth
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-0.5" style={`background:${EDGE_COLORS.interaction}`}/>
                    Interaction
                </div>
            </div>
            {/* Path calculator toggle */}
            <div class="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                <button
                    class={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                        pathMode()
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background/90 text-muted-foreground border-border hover:text-foreground"
                    }`}
                    onClick={() => setPathMode(m => !m)}
                >
                    {pathMode() ? "✕ Exit Path Mode" : <><IconPath class="text-blue-500 inline"/> Path Calculator</>}
                </button>
                <Show when={pathMode() && !pathStart()}>
                    <div class="text-xs text-muted-foreground bg-background/90 border rounded-md px-3 py-1.5 select-none">
                        Click a start node
                    </div>
                </Show>
                <Show when={pathMode() && pathStart() && !pathEnd()}>
                    <div class="text-xs text-muted-foreground bg-background/90 border rounded-md px-3 py-1.5 select-none">
                        {pathStartLabel()} <IconStart class="text-green-500 inline"/> — now click an end node
                    </div>
                </Show>
                <Show when={pathResult()}>
                    {(result) => (
                        <div class="bg-background/95 border rounded-md px-4 py-3 text-sm max-w-xs select-none">
                            <div class="text-xs text-muted-foreground mb-1">
                                {pathStartLabel()} <IconStart class="text-green-500 inline"/>
                                {"—"}
                                <IconEnd class="text-red-500 inline"/> {pathEndLabel()}
                            </div>
                            <div class="font-medium">
                                Expected time: {readableSeconds(result().expectedTime)}
                            </div>
                            <Show when={result().itemCosts.length}>
                                <div class="mt-1 text-xs text-muted-foreground">Expected items:</div>
                                <For each={result().itemCosts}>
                                    {(cost) => (
                                        <div class="text-xs ml-2">
                                            {cost.expectedQuantity % 1 < 0.01
                                                ? cost.expectedQuantity.toFixed(0)
                                                : cost.expectedQuantity.toFixed(1)}× {cost.name}
                                        </div>
                                    )}
                                </For>
                            </Show>
                            <button
                                class="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => { setPathStart(null); setPathEnd(null); }}
                            >
                                Clear selection
                            </button>
                        </div>
                    )}
                </Show>
                <Show when={pathMode() && pathStart() && pathEnd() && !pathResult()}>
                    <div class="text-xs text-red-400 bg-background/90 border rounded-md px-3 py-1.5 select-none">
                        No path found between these nodes
                    </div>
                </Show>
            </div>
            <div class="absolute bottom-3 right-3 z-10 text-xs text-muted-foreground/60 pointer-events-none select-none">
                scroll to zoom · drag to pan · {pathMode() ? "click nodes to calculate path" : "click to navigate"}
            </div>

            <svg
                ref={svgRef!}
                width="100%" height="100%"
                style="display:block;flex:1;min-height:0"
            >
                <defs>
                    <For each={Object.entries(EDGE_COLORS)}>
                        {([type, color]) => (
                            <marker id={`arrow-${type}`} viewBox="0 -5 10 10" refX={10} refY={0}
                                    markerWidth={6} markerHeight={6} orient="auto">
                                <path d="M0,-5L10,0L0,5" fill={color}/>
                            </marker>
                        )}
                    </For>
                </defs>

                <g transform={transformStr()}>
                    {/* Edges (including self-loops) */}
                    <For each={routedEdges()}>
                        {(edge) => {
                            const isHov = () => hoveredEdge() === edge.index;
                            const color = EDGE_COLORS[edge.edgeType as keyof typeof EDGE_COLORS] ?? "hsl(0 0% 50%)";
                            // Self-loops use a slightly thicker transparent hit area since the arc is small
                            const hitWidth = edge.isSelfLoop ? 10 : 14;
                            return (
                                <g>
                                    <path d={edge.d} fill="none"
                                          stroke={color}
                                          opacity={isHov() ? 1 : 0.6}
                                          stroke-width={isHov() ? 2.5 : 1.5}
                                          marker-end={`url(#arrow-${edge.edgeType})`}
                                          style="pointer-events:none"/>
                                    <path d={edge.d} fill="none" stroke="transparent" stroke-width={hitWidth}
                                          onMouseEnter={() => setHoveredEdge(edge.index)}
                                          onMouseLeave={() => setHoveredEdge(null)}
                                          style="cursor:default"/>
                                </g>
                            );
                        }}
                    </For>

                    {/* Edge labels */}
                    <For each={routedEdges()}>
                        {(edge) => {
                            const bw = () => Math.max(60, edge.label.length * 6.2 + 16);
                            const bh = 18;
                            return (
                                <Show when={edge.label}>
                                    <g style="pointer-events:none">
                                        <rect
                                            x={edge.mid.x - bw() / 2} y={edge.mid.y - bh / 2}
                                            width={bw()} height={bh} rx={3}
                                            class="fill-background stroke-border"
                                            opacity={0.92}
                                            stroke-width={0.5}
                                        />
                                        <text x={edge.mid.x} y={edge.mid.y} text-anchor="middle"
                                              dominant-baseline="middle" font-size="9"
                                              fill="currentColor" opacity={0.6}
                                              style="font-family:system-ui">
                                            {edge.label}
                                        </text>
                                    </g>
                                </Show>
                            );
                        }}
                    </For>

                    {/* Interaction hover tooltips */}
                    <For each={routedEdges()}>
                        {(edge) => {
                            const isHov = () => hoveredEdge() === edge.index;
                            return (
                                <Show when={isHov() && edge.tooltip}>
                                    <g style="pointer-events:none">
                                        <rect
                                            x={edge.mid.x - 70} y={edge.mid.y + 14}
                                            width={140} height={20} rx={3}
                                            class="fill-background stroke-border"
                                            opacity={0.95}
                                            stroke-width={0.5}
                                        />
                                        <text x={edge.mid.x} y={edge.mid.y + 24} text-anchor="middle"
                                              dominant-baseline="middle" font-size="9"
                                              fill="currentColor"
                                              style="font-family:system-ui">
                                            {edge.tooltip}
                                        </text>
                                    </g>
                                </Show>
                            );
                        }}
                    </For>

                    {/* Nodes — foreignObject with GameIcon */}
                    <For each={props.nodes}>
                        {(node) => {
                            const pos = () => nodePositions().get(node.id) ?? {x: 0, y: 0};
                            const isHov = () => hoveredNode() === node.id;
                            const isClickable = () => pathMode() || node.placementId != null || node.detailHref;
                            const isPathStart = () => pathStart() === node.id;
                            const isPathEnd = () => pathEnd() === node.id;
                            const lines = splitLabel(node.label, 14);

                            const renderIcon = () => {
                                if (node.type === "placeable") {
                                    const desc = () => placeableIndex()?.get(node.gameId);
                                    return (
                                        <Show when={desc()}>
                                            {(d) => <PlaceableIcon placeable={d()} small noInteract/>}
                                        </Show>
                                    );
                                } else {
                                    const isCargo = node.itemType === "Cargo";
                                    if (isCargo) {
                                        const desc = () => cargoIndex()?.get(node.gameId);
                                        return (
                                            <Show when={desc()}>
                                                {(d) => <CargoIcon cargo={d()} small noInteract/>}
                                            </Show>
                                        );
                                    } else {
                                        const desc = () => itemIndex()?.get(node.gameId);
                                        return (
                                            <Show when={desc()}>
                                                {(d) => <ItemIcon item={d()} small noInteract/>}
                                            </Show>
                                        );
                                    }
                                }
                            };

                            return (
                                <g
                                    transform={`translate(${pos().x - NODE_W / 2},${pos().y - NODE_H / 2})`}
                                    style={`cursor:${isClickable() ? "pointer" : "default"}`}
                                    onMouseEnter={() => setHoveredNode(node.id)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    onClick={() => {
                                        if (pathMode()) {
                                            if (!pathStart() || (pathStart() && pathEnd())) {
                                                setPathStart(node.id);
                                                setPathEnd(null);
                                            } else {
                                                setPathEnd(node.id);
                                            }
                                            return;
                                        }
                                        if (node.placementId != null && props.onPlacementSelect) {
                                            props.onPlacementSelect(node.placementId);
                                        } else if (node.detailHref) {
                                            props.onNavigate(node.detailHref);
                                        }
                                    }}
                                >
                                    {/* Icon via foreignObject */}
                                    <foreignObject
                                        x={0} y={0}
                                        width={NODE_W} height={NODE_H - 20}
                                        style="overflow:visible;pointer-events:none"
                                    >
                                        <div
                                            style="display:flex;align-items:center;justify-content:center;width:100%;height:100%"
                                        >
                                            {renderIcon()}
                                        </div>
                                    </foreignObject>
                                    {/* Name label below icon */}
                                    <text
                                        x={NODE_W / 2}
                                        text-anchor="middle"
                                        font-size="10"
                                        fill="currentColor"
                                        style="pointer-events:none;font-family:system-ui"
                                    >
                                        <For each={lines}>
                                            {(line, i) => (
                                                <tspan
                                                    x={NODE_W / 2}
                                                    y={NODE_H - 16 + i() * 12}
                                                >
                                                    {line}
                                                </tspan>
                                            )}
                                        </For>
                                    </text>
                                    {/* Hover highlight */}
                                    <Show when={isHov()}>
                                        <rect
                                            x={-2} y={-2}
                                            width={NODE_W + 4} height={NODE_H + 4}
                                            rx={6}
                                            fill="none"
                                            stroke="currentColor"
                                            opacity={0.3}
                                            stroke-width={1.5}
                                        />
                                    </Show>
                                    {/* Path selection indicators */}
                                    <Show when={isPathStart()}>
                                        <rect
                                            x={-3} y={-3}
                                            width={NODE_W + 6} height={NODE_H + 6}
                                            rx={7}
                                            fill="none"
                                            stroke="hsl(130 60% 50%)"
                                            stroke-width={2}
                                            stroke-dasharray="4,2"
                                        />
                                    </Show>
                                    <Show when={isPathEnd()}>
                                        <rect
                                            x={-3} y={-3}
                                            width={NODE_W + 6} height={NODE_H + 6}
                                            rx={7}
                                            fill="none"
                                            stroke="hsl(0 65% 55%)"
                                            stroke-width={2}
                                            stroke-dasharray="4,2"
                                        />
                                    </Show>
                                    {/* Clickable indicator for items that start placements */}
                                    <Show when={node.placementId != null}>
                                        <text
                                            x={NODE_W - 4} y={12}
                                            text-anchor="end" font-size="10"
                                            fill="currentColor" opacity={0.5}
                                            style="pointer-events:none"
                                        >
                                            ↗
                                        </text>
                                    </Show>
                                    {/* Invisible clickable area */}
                                    <rect
                                        x={0} y={0}
                                        width={NODE_W} height={NODE_H}
                                        fill="transparent"
                                    />
                                </g>
                            );
                        }}
                    </For>
                </g>
            </svg>
        </div>
    );
}

// ─── Graph Builder (BFS) ────────────────────────────────────────

export interface PlaceableGraphData {
    nodes: PlaceableGraphNode[];
    edges: PlaceableGraphEdge[];
}

export function buildPlaceableGraph(placementId: number): PlaceableGraphData {
    const placeableIndex = BitCraftTables.PlaceableDesc.indexedBy("id")();
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id")();
    const cargoIndex = BitCraftTables.CargoDesc.indexedBy("id")();
    const placementAll = BitCraftTables.PlaceablePlacementDesc.get() ?? [];
    const placement = placementAll.find(p => p.id === placementId);

    if (!placement) return {nodes: [], edges: []};

    const nodes: PlaceableGraphNode[] = [];
    const edges: PlaceableGraphEdge[] = [];
    const visitedPlaceables = new Set<number>();
    const nodeIds = new Set<string>();

    // Build indexes
    const growthByPlaceable = useGrowthByPlaceable()();
    const interactionsByPlaceable = useInteractionsByPlaceable()();

    // Check if an item also has a placement
    const placementByItem = new Map<string, PlaceablePlacementDesc>();
    for (const pp of placementAll) {
        const key = `${pp.inputItem.itemType.tag}-${pp.inputItem.itemId}`;
        placementByItem.set(key, pp);
    }

    function addItemNode(itemId: number, itemType: string, column: number, linkPlacement = true): string {
        const nodeId = `${itemType}-${itemId}`;
        if (nodeIds.has(nodeId)) return nodeId;
        nodeIds.add(nodeId);

        const isCargo = itemType === "Cargo";
        const desc = isCargo ? cargoIndex?.get(itemId) : itemIndex?.get(itemId);
        const name = desc?.name ?? `${itemType} #${itemId}`;
        const pp = linkPlacement ? placementByItem.get(`${itemType}-${itemId}`) : undefined;

        nodes.push({
            id: nodeId,
            label: name,
            type: "item",
            gameId: itemId,
            itemType,
            column,
            placementId: pp?.id,
            detailHref: isCargo ? `/database/cargo/${itemId}` : `/database/item/${itemId}`,
        });

        return nodeId;
    }

    function addPlaceableNode(plcId: number, column: number): string {
        const nodeId = `placeable-${plcId}`;
        if (nodeIds.has(nodeId)) return nodeId;
        nodeIds.add(nodeId);

        const desc = placeableIndex?.get(plcId);
        nodes.push({
            id: nodeId,
            label: desc?.name ?? `Placeable #${plcId}`,
            type: "placeable",
            gameId: plcId,
            column,
            detailHref: `/database/placeable/${plcId}`,
        });

        return nodeId;
    }

    // Start: input item → placed placeable
    const inputItemType = placement.inputItem.itemType.tag;
    const inputNodeId = addItemNode(placement.inputItem.itemId, inputItemType, 0, false);
    const startPlcId = placement.placedPlaceableId;

    // BFS
    const queue: { plcId: number; column: number }[] = [{plcId: startPlcId, column: 1}];

    while (queue.length > 0) {
        const {plcId, column} = queue.shift()!;
        if (visitedPlaceables.has(plcId)) continue;
        visitedPlaceables.add(plcId);

        const plcNodeId = addPlaceableNode(plcId, column);

        // Placement edge (only for the root)
        if (plcId === startPlcId) {
            edges.push({
                source: inputNodeId,
                target: plcNodeId,
                label: `Place (${readableSeconds(placement.requiredTime)})`,
                edgeType: "placement",
            });
        }

        // Growth
        const growth = growthByPlaceable.get(plcId);
        if (growth) {
            const totalWeight = growth.outcomes.reduce((s, o) => s + o.probability, 0);
            const minTime = growth.time[0] ?? 0;
            const maxTime = growth.time[1] ?? minTime;

            for (const outcome of growth.outcomes) {
                const pct = totalWeight > 0 ? (outcome.probability / totalWeight) * 100 : 0;
                const isSelf = outcome.placeableId === plcId;
                const label = `${pct.toFixed(0)}% | ${readableSeconds(minTime)}–${readableSeconds(maxTime)}`;

                const outcomeNodeId = addPlaceableNode(outcome.placeableId, column + 1);
                edges.push({
                    source: plcNodeId,
                    target: outcomeNodeId,
                    label,
                    edgeType: "growth",
                    isSelfLoop: isSelf,
                });

                if (!isSelf && !visitedPlaceables.has(outcome.placeableId)) {
                    queue.push({plcId: outcome.placeableId, column: column + 1});
                }
            }
        }

        // Interactions
        const interactions = interactionsByPlaceable.get(plcId) ?? [];
        for (const ia of interactions) {
            // Tooltip: consumed items
            const tooltip = ia.consumedItemStacks.length
                ? ia.consumedItemStacks.map(s => {
                    const name = s.itemType.tag === "Cargo"
                        ? cargoIndex?.get(s.itemId)?.name ?? `Cargo #${s.itemId}`
                        : itemIndex?.get(s.itemId)?.name ?? `Item #${s.itemId}`;
                    return `${s.quantity}× ${name}`;
                }).join(", ")
                : undefined;

            // Output items
            // If an interaction produces multiple items and at least one already
            // exists as a node, treat the others as byproducts (shown on hover)
            // rather than creating separate nodes for them.
            const outputs = ia.outputItemStacks;
            const existingOutputs = outputs.filter(o => nodeIds.has(`${o.itemType.tag}-${o.itemId}`));
            const novelOutputs = outputs.filter(o => !nodeIds.has(`${o.itemType.tag}-${o.itemId}`));

            if (outputs.length > 1 && existingOutputs.length > 0 && novelOutputs.length > 0) {
                // Byproduct mode: only create edges to existing nodes,
                // show novel items as "also produces" in tooltip
                const byproductStr = novelOutputs.map(o => {
                    const name = o.itemType.tag === "Cargo"
                        ? cargoIndex?.get(o.itemId)?.name ?? `Cargo #${o.itemId}`
                        : itemIndex?.get(o.itemId)?.name ?? `Item #${o.itemId}`;
                    return `${o.quantity}× ${name}`;
                }).join(", ");

                const fullTooltip = [tooltip, `Also: ${byproductStr}`].filter(Boolean).join(" | ");

                for (const output of existingOutputs) {
                    const outNodeId = `${output.itemType.tag}-${output.itemId}`;
                    edges.push({
                        source: plcNodeId,
                        target: outNodeId,
                        label: `${ia.verbPhrase} → ${output.quantity}×`,
                        edgeType: "interaction",
                        tooltip: fullTooltip,
                    });
                }
            } else {
                // Normal mode: create nodes and edges for all outputs
                for (const output of outputs) {
                    const outNodeId = addItemNode(output.itemId, output.itemType.tag, column + 2);
                    edges.push({
                        source: plcNodeId,
                        target: outNodeId,
                        label: `${ia.verbPhrase} → ${output.quantity}×`,
                        edgeType: "interaction",
                        tooltip,
                    });
                }
            }

            // Spawned placeable
            if (ia.onDestroySpawnedPlaceableId && ia.onDestroySpawnedPlaceableId !== 0) {
                const spawnNodeId = addPlaceableNode(ia.onDestroySpawnedPlaceableId, column + 1);
                const chance = ia.onDestroySpawnedPlaceableChance;
                const chanceStr = chance < 1 ? ` (${Math.round(chance * 100)}%)` : "";
                edges.push({
                    source: plcNodeId,
                    target: spawnNodeId,
                    label: `${ia.verbPhrase}${chanceStr}`,
                    edgeType: "interaction",
                    tooltip,
                });

                if (!visitedPlaceables.has(ia.onDestroySpawnedPlaceableId)) {
                    queue.push({plcId: ia.onDestroySpawnedPlaceableId, column: column + 1});
                }
            }
        }
    }

    return {nodes, edges};
}
