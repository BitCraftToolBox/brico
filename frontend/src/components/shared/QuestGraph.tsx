import * as d3Selection from "d3-selection";
import "d3-transition";
import * as d3Zoom from "d3-zoom";
import {TbOutlineCheck as IconCheck, TbOutlineSearch as IconSearch, TbOutlineX as IconX,} from "solid-icons/tb";
import {Accessor, createEffect, createMemo, createSignal, DEV, For, onCleanup, onMount, Show} from "solid-js";
import {QuestRequirement} from "~/bindings/src/quest_requirement_type";
import {Popover, PopoverContent, PopoverTrigger} from "~/components/ui/popover";
import {LinkedList, QuestChainLink} from "~/lib/game-links";
import {computeQuestTree, getQuestTreeIds, questChainCompleter, stagesByChain} from "~/lib/quests";
import {BitCraftTables} from "~/lib/spacetime";
import {ReqOrRewardLink} from "~/lib/table-defs/quests-table";
import {cn} from "~/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

export interface QuestGraphNode {
    id: number;          // quest chain id
    name: string;
    column: number;
    /** Quest chain IDs this quest directly requires */
    questPrereqs: number[];
}

export interface QuestGraphEdge {
    source: number;  // required quest id
    target: number;  // dependent quest id
}

export interface QuestGraphProps {
    completedQuests: Accessor<Set<number>>;
    setCompletedQuests: (ids: number[]) => void;
    focusChainId?: number;
    /** Called when a quest is selected (search suggestion committed or node clicked). Does NOT trigger zoom. */
    setChainId?: (id: number) => void;
}

/** Bounding box (in grid units) of an ownership-tree subtree */
export interface SubtreeRange {
    rootId: number;
    rootName: string;
    /** Inclusive row range in the final global pixel space (converted from rows) */
    startRow: number;
    endRow: number;
    /** Column of the subtree root */
    startCol: number;
    /** Max column of any node in the ownership subtree */
    endCol: number;
    /** Depth in the ownership tree (0 = virtual-root child) */
    depth: number;
}

interface LayoutResult {
    positions: Map<number, { x: number; y: number }>;
    subtreeRanges: SubtreeRange[];
}

// ─── Sizing ─────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 36;
const COL_GAP = 220;
const ROW_GAP = 48;

const EDGE_COLOR = "hsl(220 60% 55%)";

// ─── Layout ─────────────────────────────────────────────────────

/**
 * Ownership-tree layout algorithm.
 */
function computeLayout(
    nodes: QuestGraphNode[],
    edges: QuestGraphEdge[],
): LayoutResult {
    if (nodes.length === 0) return {positions: new Map(), subtreeRanges: []};

    const nodeById = new Map<number, QuestGraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    // ── Build directed adjacency ──
    const dagChildren = new Map<number, number[]>();
    const dagParents = new Map<number, number[]>();
    for (const n of nodes) {
        dagChildren.set(n.id, []);
        dagParents.set(n.id, []);
    }
    for (const e of edges) {
        dagChildren.get(e.source)!.push(e.target);
        dagParents.get(e.target)!.push(e.source);
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 1 — Build Ownership Tree
    //
    // Every node is assigned exactly one "owner" parent, turning the
    // DAG into a tree rooted at a virtual sentinel.  Multi-parent
    // nodes go to the parent that currently has the fewest owned
    // children (processed in topological / depth order so parents
    // are always assigned before their children).
    // ═════════════════════════════════════════════════════════════

    const VIRTUAL_ROOT = -1;
    const owner = new Map<number, number>();
    const ownedChildren = new Map<number, number[]>();
    ownedChildren.set(VIRTUAL_ROOT, []);
    for (const n of nodes) ownedChildren.set(n.id, []);

    const byDepth = [...nodes].sort((a, b) => a.column - b.column);
    for (const n of byDepth) {
        const pars = dagParents.get(n.id)!;
        let ownerId: number;
        if (pars.length === 0) {
            ownerId = VIRTUAL_ROOT;
        } else if (pars.length === 1) {
            ownerId = pars[0];
        } else {
            // Multi-parent: pick parent with fewest owned children so far
            ownerId = pars[0];
            let bestCount = ownedChildren.get(pars[0])!.length;
            for (let i = 1; i < pars.length; i++) {
                const c = ownedChildren.get(pars[i])!.length;
                if (c < bestCount) {
                    bestCount = c;
                    ownerId = pars[i];
                }
            }
            if (DEV) console.log(
                `[owner] "${n.name}" (${pars.length} parents: [${pars.map(p => nodeById.get(p)?.name ?? p).join(", ")}]) → assigned to "${nodeById.get(ownerId)?.name}" (${bestCount} existing children)`
            );
        }
        owner.set(n.id, ownerId);
        ownedChildren.get(ownerId)!.push(n.id);
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 2 — Identify Cross-Branch Constraints
    //
    // For every multi-parent node whose parents span different
    // ownership branches, we trace both parents up to their Lowest
    // Common Ancestor (LCA) in the ownership tree and record:
    //
    //   • Sibling affinity at the LCA — the two diverging children
    //     of the LCA should be placed adjacent.
    //
    //   • Path (lean) constraints below the LCA — every intermediate
    //     node on each path gets told which of its children should be
    //     pushed toward the other branch.
    // ═════════════════════════════════════════════════════════════

    /** Trace ownership chain from `id` up to VIRTUAL_ROOT. */
    function ancestorPath(id: number): number[] {
        const path: number[] = [];
        let cur = id;
        while (cur !== VIRTUAL_ROOT) {
            path.push(cur);
            const next = owner.get(cur);
            if (next === undefined) break;
            cur = next;
        }
        path.push(VIRTUAL_ROOT);
        return path;
    }

    // Sibling affinities keyed by the parent (LCA) id
    const affinityPairs = new Map<number, [number, number][]>();

    interface PathConstraint {
        childOnPath: number;        // which child of the constrained node is on the path
        lcaId: number;              // the LCA where the two branches diverge
        targetSiblingAtLCA: number; // the *other* branch's child at the LCA level
    }

    const pathConstraints = new Map<number, PathConstraint[]>();

    for (const n of nodes) {
        const pars = dagParents.get(n.id)!;
        if (pars.length <= 1) continue;
        const ownerId = owner.get(n.id)!;

        for (const othParent of pars) {
            if (othParent === ownerId) continue;

            const pathA = ancestorPath(ownerId);
            const pathB = ancestorPath(othParent);

            // Find LCA
            const ancestorsB = new Set(pathB);
            let lca = VIRTUAL_ROOT;
            for (const id of pathA) {
                if (ancestorsB.has(id)) {
                    lca = id;
                    break;
                }
            }

            const idxA = pathA.indexOf(lca);
            const idxB = pathB.indexOf(lca);
            if (idxA <= 0 || idxB <= 0) continue;

            const childA = pathA[idxA - 1]; // LCA's child on owner-side
            const childB = pathB[idxB - 1]; // LCA's child on other-parent-side
            if (childA === childB) continue; // same sub-branch — nothing to do

            const lcaName = lca === VIRTUAL_ROOT ? "(virtual root)" : (nodeById.get(lca)?.name ?? String(lca));
            const nm = (id: number) => nodeById.get(id)?.name ?? String(id);
            if (DEV) console.log(
                `[cross] "${n.name}" (owner="${nm(ownerId)}", other="${nm(othParent)}") → `
                + `LCA="${lcaName}", affinity [${nm(childA)}, ${nm(childB)}]`
            );

            // Record sibling affinity at LCA
            if (!affinityPairs.has(lca)) affinityPairs.set(lca, []);
            affinityPairs.get(lca)!.push([childA, childB]);

            // Record path constraints below LCA on both branches
            for (let i = idxA - 1; i > 0; i--) {
                if (!pathConstraints.has(pathA[i])) pathConstraints.set(pathA[i], []);
                pathConstraints.get(pathA[i])!.push({
                    childOnPath: pathA[i - 1],
                    lcaId: lca,
                    targetSiblingAtLCA: childB,
                });
            }
            for (let i = idxB - 1; i > 0; i--) {
                if (!pathConstraints.has(pathB[i])) pathConstraints.set(pathB[i], []);
                pathConstraints.get(pathB[i])!.push({
                    childOnPath: pathB[i - 1],
                    lcaId: lca,
                    targetSiblingAtLCA: childA,
                });
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 3 — Order Siblings  (top-down)
    //
    // Processing the ownership tree from root to leaves.  At each
    // node we resolve:
    //   1. Sibling affinities → build a greedy chain of mutually
    //      attracted children (nearest-neighbor heuristic).
    //   2. Lean directions → push constrained children toward the
    //      edge of the sibling list that faces the other branch
    //      (direction derived from already-resolved ancestor
    //      positions).
    //   3. Neutral children fill the remaining positions.
    // ═════════════════════════════════════════════════════════════

    const finalOrder = new Map<number, number[]>();
    const siblingIndex = new Map<number, number>(); // nodeId → its position among siblings

    /** Walk up from `nodeId` to find its ancestor that is a direct child of `lcaId`. */
    function ancestorChildOfLCA(nodeId: number, lcaId: number): number | undefined {
        let cur = nodeId;
        while (cur !== VIRTUAL_ROOT) {
            if (owner.get(cur) === lcaId) return cur;
            cur = owner.get(cur)!;
        }
        return undefined;
    }

    /** Compute lean direction for each child of `parentId`. */
    function computeLeanDirections(parentId: number): Map<number, "start" | "end"> {
        const lean = new Map<number, "start" | "end">();
        const constraints = pathConstraints.get(parentId);
        if (!constraints) return lean;

        const nm = (id: number) => nodeById.get(id)?.name ?? String(id);
        const parentName = parentId === VIRTUAL_ROOT
            ? "(virtual root)"
            : (nodeById.get(parentId)?.name ?? String(parentId));

        for (const c of constraints) {
            const ourAncestor = ancestorChildOfLCA(parentId, c.lcaId);
            if (!ourAncestor) continue;
            const ourPos = siblingIndex.get(ourAncestor);
            const targetPos = siblingIndex.get(c.targetSiblingAtLCA);
            if (ourPos === undefined || targetPos === undefined) continue;

            const dir = targetPos > ourPos ? "end" : "start";
            lean.set(c.childOnPath, dir);

            if (DEV) {
                const lcaName = c.lcaId === VIRTUAL_ROOT ? "(virtual root)" : nm(c.lcaId);
                console.log(
                    `[lean] At "${parentName}": child "${nm(c.childOnPath)}" → ${dir}`
                    + ` (ancestor "${nm(ourAncestor)}" @${ourPos} vs target "${nm(c.targetSiblingAtLCA)}" @${targetPos} at LCA "${lcaName}")`
                );
            }
        }
        return lean;
    }

    /**
     * Order `kids` respecting affinity pairs and lean directions.
     *
     * The affinity chain is oriented so that lean-start members are
     * near the start and lean-end members are near the end, then
     * placed relative to neutral nodes accordingly:
     *
     *   chain leans "end":   [startLean] [neutral] [chain] [endLean]
     *   chain leans "start": [startLean] [chain] [neutral] [endLean]
     *   no lean / equal:     [startLean] [chain] [neutral] [endLean]
     */
    function orderSiblings(
        parentId: number,
        kids: number[],
        affinities: [number, number][],
        lean: Map<number, "start" | "end">,
    ): number[] {
        if (kids.length <= 1) return [...kids];
        if (affinities.length === 0 && lean.size === 0) return [...kids];

        const parentName = parentId === VIRTUAL_ROOT
            ? "(virtual root)"
            : (nodeById.get(parentId)?.name ?? String(parentId));

        // ── Weighted affinity graph over kids ──
        const kidSet = new Set(kids);
        const adjW = new Map<number, Map<number, number>>();
        for (const id of kids) adjW.set(id, new Map());

        const hasAffinity = new Set<number>();
        for (const [a, b] of affinities) {
            if (!kidSet.has(a) || !kidSet.has(b) || a === b) continue;
            hasAffinity.add(a);
            hasAffinity.add(b);
            adjW.get(a)!.set(b, (adjW.get(a)!.get(b) ?? 0) + 1);
            adjW.get(b)!.set(a, (adjW.get(b)!.get(a) ?? 0) + 1);
        }

        // ── Categorize ──
        const startLean: number[] = [];
        const endLean: number[] = [];
        const affinityKids: number[] = [];
        const neutral: number[] = [];

        for (const k of kids) {
            if (hasAffinity.has(k)) affinityKids.push(k);
            else if (lean.get(k) === "start") startLean.push(k);
            else if (lean.get(k) === "end") endLean.push(k);
            else neutral.push(k);
        }

        // Log categorization
        const nm = (id: number) => nodeById.get(id)?.name ?? String(id);
        if (DEV && (affinityKids.length || lean.size > 0)) {
            console.log(`[order] Parent: ${parentName}`);
            if (affinityKids.length)
                console.log(`  affinity: [${affinityKids.map(nm).join(", ")}]`);
            if (startLean.length)
                console.log(`  lean-start: [${startLean.map(nm).join(", ")}]`);
            if (endLean.length)
                console.log(`  lean-end: [${endLean.map(nm).join(", ")}]`);
            if (neutral.length)
                console.log(`  neutral: [${neutral.map(nm).join(", ")}]`);
            for (const [id, dir] of lean) {
                console.log(`  lean detail: ${nm(id)} → ${dir}`);
            }
        }

        // ── Build greedy chain of affinity kids ──
        let chain: number[] = [];
        // Track aggregate lean gravity of the chain:
        //   positive = chain members predominantly lean "end"
        //   negative = predominantly lean "start"
        let chainGravity = 0;

        if (affinityKids.length) {
            // Seed from the highest-total-weight node
            let seed = affinityKids[0], seedW = 0;
            for (const id of affinityKids) {
                let tw = 0;
                for (const w of adjW.get(id)!.values()) tw += w;
                if (tw > seedW) {
                    seedW = tw;
                    seed = id;
                }
            }
            chain = [seed];
            const used = new Set([seed]);

            while (used.size < affinityKids.length) {
                const last = chain[chain.length - 1];
                const first = chain[0];
                let bestEnd: number | null = null, bestEndW = -1;
                let bestStart: number | null = null, bestStartW = -1;

                for (const id of affinityKids) {
                    if (used.has(id)) continue;
                    const we = adjW.get(last)?.get(id) ?? 0;
                    const ws = adjW.get(first)?.get(id) ?? 0;
                    if (we > bestEndW) {
                        bestEndW = we;
                        bestEnd = id;
                    }
                    if (ws > bestStartW) {
                        bestStartW = ws;
                        bestStart = id;
                    }
                }

                if (bestEndW >= bestStartW && bestEnd !== null) {
                    chain.push(bestEnd);
                    used.add(bestEnd);
                } else if (bestStart !== null) {
                    chain.unshift(bestStart);
                    used.add(bestStart);
                } else {
                    // Disconnected — append remaining
                    for (const id of affinityKids) {
                        if (!used.has(id)) {
                            chain.push(id);
                            used.add(id);
                        }
                    }
                }
            }

            // Orient chain: satisfaction-based scoring.
            // "start" lean → satisfied when near index 0 (low t).
            // "end"   lean → satisfied when near last index (high t).
            // fwd = total satisfaction in current order.
            // rev = total satisfaction if reversed.
            let fwd = 0, rev = 0;
            const denom = (chain.length - 1) || 1;
            for (let i = 0; i < chain.length; i++) {
                const d = lean.get(chain[i]);
                const t = i / denom; // 0 … 1
                if (d === "start") {
                    fwd += 1 - t;
                    rev += t;
                } else if (d === "end") {
                    fwd += t;
                    rev += 1 - t;
                }
            }
            if (rev > fwd) chain.reverse();

            // Compute chain gravity from lean directions of chain members
            for (const id of chain) {
                const d = lean.get(id);
                if (d === "end") chainGravity++;
                if (d === "start") chainGravity--;
            }

            if (DEV) console.log(`  chain (oriented): [${chain.map(nm).join(", ")}]  gravity=${chainGravity > 0 ? "end" : chainGravity < 0 ? "start" : "none"}`);
        }

        // Position chain relative to neutral based on its gravity.
        // Positive gravity (leans "end") → chain AFTER neutral (high row numbers).
        // Negative or zero → chain BEFORE neutral.
        let result: number[];
        if (chainGravity > 0) {
            result = [...startLean, ...neutral, ...chain, ...endLean];
        } else {
            result = [...startLean, ...chain, ...neutral, ...endLean];
        }

        if (DEV) console.log(`  → final order: [${result.map(nm).join(", ")}]`);
        return result;
    }

    /** Recursively order children of `parentId` and all descendants. */
    function processNode(parentId: number): void {
        const kids = ownedChildren.get(parentId) ?? [];
        if (kids.length === 0) {
            finalOrder.set(parentId, []);
            return;
        }

        const affs = affinityPairs.get(parentId) ?? [];
        const lean = computeLeanDirections(parentId);
        const ordered = orderSiblings(parentId, kids, affs, lean);

        finalOrder.set(parentId, ordered);
        for (let i = 0; i < ordered.length; i++) siblingIndex.set(ordered[i], i);

        for (const c of ordered) processNode(c);
    }

    processNode(VIRTUAL_ROOT);

    // ── Shared helpers (used by Phases 4–6) ──

    /** Collect every node in the owned subtree rooted at `rootId`. */
    function getOwnedSubtreeNodes(rootId: number): number[] {
        const result: number[] = [];
        const stk = [rootId];
        while (stk.length) {
            const nid = stk.pop()!;
            result.push(nid);
            for (const kid of (finalOrder.get(nid) ?? [])) stk.push(kid);
        }
        return result;
    }

    // Ownership depth (0 = root level, increases downward)
    const ownerDepth = new Map<number, number>();
    for (const rootId of (finalOrder.get(VIRTUAL_ROOT) ?? [])) ownerDepth.set(rootId, 0);
    const depthQueue = [...(finalOrder.get(VIRTUAL_ROOT) ?? [])];
    while (depthQueue.length) {
        const nid = depthQueue.shift()!;
        const d = ownerDepth.get(nid) ?? 0;
        for (const kid of (finalOrder.get(nid) ?? [])) {
            ownerDepth.set(kid, d + 1);
            depthQueue.push(kid);
        }
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 4 — Assign Coordinates  (naive)
    //
    // DFS of the ownership tree.  Leaf nodes (no owned children)
    // receive sequential row positions.  Internal nodes are
    // vertically centred among their children.
    // ═════════════════════════════════════════════════════════════

    const pos = new Map<number, { x: number; y: number }>();
    let currentRow = 0;
    const nodeRow = new Map<number, number>();

    function dfsAssign(nodeId: number): void {
        const node = nodeById.get(nodeId);
        if (!node) return;
        const kids = finalOrder.get(nodeId) ?? [];

        if (kids.length === 0) {
            nodeRow.set(nodeId, currentRow);
            pos.set(nodeId, {x: node.column * COL_GAP, y: currentRow * ROW_GAP});
            currentRow++;
        } else {
            for (const c of kids) dfsAssign(c);
            const ys = kids.map(k => pos.get(k)?.y ?? 0);
            const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
            nodeRow.set(nodeId, midY / ROW_GAP);
            pos.set(nodeId, {
                x: node.column * COL_GAP,
                y: midY,
            });
        }
    }

    for (const rootId of (finalOrder.get(VIRTUAL_ROOT) ?? [])) {
        dfsAssign(rootId);
    }

    // ═════════════════════════════════════════════════════════════
    // PHASE 5 — Branch Compaction  (bottom-up)
    //
    // Close vertical gaps between sibling subtrees by sliding the
    // *smaller* subtree toward the *larger* one.  Processed from
    // the deepest ownership level up so that inner compaction
    // settles before outer parents recenter.
    //
    // Within each parent's children, gaps are processed largest
    // first so nodes preferentially shift toward the bigger gap
    // (e.g. Carty Time shifts down toward the 4-row gap with
    // Social Market rather than up toward the 1-row gap with
    // Bricks for a Home).  After each successful shift the gap
    // list is rescanned from scratch.
    //
    // A per-node direction guard prevents oscillation: once a
    // subtree shifts in one direction, it cannot shift back the
    // other way during the same parent's compaction.
    // ═════════════════════════════════════════════════════════════

    // Column occupancy: col → Map<nodeId, row>  (tracks ALL nodes)
    const colPositions = new Map<number, Map<number, number>>();
    for (const n of nodes) {
        const r = nodeRow.get(n.id);
        if (r === undefined) continue;
        if (!colPositions.has(n.column)) colPositions.set(n.column, new Map());
        colPositions.get(n.column)!.set(n.id, r);
    }

    // ── Phantom blockers for multi-column parent→child corridors ──
    // When a DAG parent is >1 column to the left of its child, the
    // intermediate columns are visually occupied by the edge.  We add
    // ghost entries so compaction cannot slide other subtrees into
    // those lanes.  Phantoms are keyed by the CHILD node so they move
    // together with the child's subtree.
    const nodePhantoms = new Map<number, { id: number; col: number }[]>();
    {
        let phantomId = -1;
        for (const n of nodes) {
            const nRow = nodeRow.get(n.id);
            if (nRow === undefined) continue;

            const pars = dagParents.get(n.id) ?? [];
            for (const par of pars) {
                const parNode = nodeById.get(par);
                if (!parNode || parNode.column >= n.column - 1) continue;
                for (let c = parNode.column + 1; c < n.column; c++) {
                    if (!colPositions.has(c)) colPositions.set(c, new Map());
                    const pid = phantomId--;
                    colPositions.get(c)!.set(pid, nRow);
                    if (!nodePhantoms.has(n.id)) nodePhantoms.set(n.id, []);
                    nodePhantoms.get(n.id)!.push({id: pid, col: c});
                }
            }
        }
    }

    /** Check whether shifting `subtreeNodeIds` by `delta` rows is collision-free.
     *  Also checks phantom nodes associated with the subtree. */
    function canShift(subtreeNodeIds: number[], delta: number): boolean {
        if (DEV) console.log("canShift", subtreeNodeIds.map(n => nodeById.get(n)?.name).join(", "), delta);
        const inSubtree = new Set(subtreeNodeIds);
        const phantomsToCheck: { id: number; col: number }[] = [];
        for (const nid of subtreeNodeIds) {
            const phs = nodePhantoms.get(nid);
            if (phs) for (const ph of phs) {
                inSubtree.add(ph.id);
                phantomsToCheck.push(ph);
            }
        }

        // Check real nodes
        for (const nid of subtreeNodeIds) {
            const node = nodeById.get(nid);
            if (!node) continue;
            const newRow = (nodeRow.get(nid) ?? 0) + delta;
            const colMap = colPositions.get(node.column);
            if (!colMap) continue;
            for (const [otherId, otherRow] of colMap) {
                if (inSubtree.has(otherId)) continue;
                if (Math.abs(newRow - otherRow) < 0.9) return false;
            }
        }

        // Check phantom nodes
        for (const ph of phantomsToCheck) {
            const colMap = colPositions.get(ph.col);
            if (!colMap) continue;
            const oldRow = colMap.get(ph.id) ?? 0;
            const newRow = oldRow + delta;
            for (const [otherId, otherRow] of colMap) {
                if (inSubtree.has(otherId)) continue;
                if (Math.abs(newRow - otherRow) < 0.9) return false;
            }
        }

        return true;
    }

    /** Apply a row-shift to every node in `subtreeNodeIds` and their phantoms. */
    function shiftSubtree(subtreeNodeIds: number[], delta: number): void {
        if (DEV) console.log("shiftSubtree", subtreeNodeIds.map(id => nodeById.get(id)?.name ?? id).join(", "), delta);
        for (const nid of subtreeNodeIds) {
            const node = nodeById.get(nid);
            if (!node) continue;
            const oldRow = nodeRow.get(nid) ?? 0;
            const newRow = oldRow + delta;
            nodeRow.set(nid, newRow);
            colPositions.get(node.column)?.set(nid, newRow);
            pos.set(nid, {x: node.column * COL_GAP, y: newRow * ROW_GAP});
        }
        // Shift associated phantom nodes
        for (const nid of subtreeNodeIds) {
            const phs = nodePhantoms.get(nid);
            if (!phs) continue;
            for (const ph of phs) {
                const colMap = colPositions.get(ph.col);
                if (!colMap) continue;
                const oldRow = colMap.get(ph.id) ?? 0;
                colMap.set(ph.id, oldRow + delta);
            }
        }
    }

    /** Min / max row of any node in the list. */
    function rowRange(nids: number[]): { min: number; max: number } {
        let min = Infinity, max = -Infinity;
        for (const nid of nids) {
            const r = nodeRow.get(nid) ?? 0;
            if (r < min) min = r;
            if (r > max) max = r;
        }
        return {min, max};
    }

    /** Recenter a parent node among its children, if the target row is free. */
    function recenterNode(parentId: number): void {
        const parentNode = nodeById.get(parentId);
        if (!parentNode) return;
        const kids = finalOrder.get(parentId) ?? [];
        if (kids.length === 0) return;

        const childYs = kids.map(k => pos.get(k)?.y ?? 0);
        const newY = (Math.min(...childYs) + Math.max(...childYs)) / 2;
        const newRow = newY / ROW_GAP;

        // Check the target row is free in the parent's column
        const colMap = colPositions.get(parentNode.column);
        if (colMap) {
            for (const [otherId, otherRow] of colMap) {
                if (otherId === parentId) continue;
                if (Math.abs(newRow - otherRow) < 0.9) return; // blocked
            }
        }

        nodeRow.set(parentId, newRow);
        pos.set(parentId, {x: parentNode.column * COL_GAP, y: newY});
        colMap?.set(parentId, newRow);
    }

    // Gather all parents (including VIRTUAL_ROOT) sorted deepest-first
    const compactParents: number[] = [VIRTUAL_ROOT];
    for (const n of nodes) {
        if ((finalOrder.get(n.id) ?? []).length) compactParents.push(n.id);
    }
    compactParents.sort((a, b) =>
        (ownerDepth.get(b) ?? -1) - (ownerDepth.get(a) ?? -1)
    );

    // Single pass, largest-gap-first within each parent
    for (const pid of compactParents) {
        const kids = finalOrder.get(pid) ?? [];
        if (kids.length <= 1) continue;

        // Build per-child subtree info (rows are mutated as we shift)
        const childInfo = kids.map(kid => {
            const sn = getOwnedSubtreeNodes(kid);
            const rr = rowRange(sn);
            return {rootId: kid, sn, minRow: rr.min, maxRow: rr.max, size: sn.length};
        });

        // Direction guard: once a subtree shifts one way it cannot
        // shift back the other way during this parent's compaction.
        const shifted = new Map<number, "up" | "down">();

        // Repeatedly pick the largest closeable gap until none remain.
        const maxIter = childInfo.length * 3; // safety cap
        for (let iter = 0; iter < maxIter; iter++) {
            // Collect gaps sorted largest-first
            const gaps: { idx: number; gap: number }[] = [];
            for (let j = 0; j < childInfo.length - 1; j++) {
                const g = childInfo[j + 1].maxRow - childInfo[j].minRow - 1;
                if (g > 0) gaps.push({idx: j, gap: g});
            }
            gaps.sort((a, b) => b.gap - a.gap);

            let closed = false;
            for (const {idx, gap} of gaps) {
                const left = childInfo[idx];
                const right = childInfo[idx + 1];
                if (DEV) console.log("gap", nodeById.get(left.rootId)?.name, "|", nodeById.get(right.rootId)?.name, gap);

                // Try preferred direction first (smaller subtree moves),
                // then fall back to the other direction if blocked.
                const preferLeftDown = left.size <= right.size;
                const tryOrder = preferLeftDown
                    ? ["leftDown", "rightUp"] as const
                    : ["rightUp", "leftDown"] as const;

                for (const attempt of tryOrder) {
                    if (attempt === "leftDown") {
                        if (DEV) console.log("trying to shift left down", nodeById.get(left.rootId)?.name, "prev?", shifted.get(left.rootId));
                        if (shifted.get(left.rootId) === "up") continue; // would oscillate
                        let best = 0;
                        for (let d = 1; d <= gap; d++) {
                            if (canShift(left.sn, d)) best = d; else break;
                        }
                        if (best > 0) {
                            shiftSubtree(left.sn, best);
                            left.minRow += best;
                            left.maxRow += best;
                            shifted.set(left.rootId, "down");
                            closed = true;
                            break;
                        }
                    } else {
                        if (DEV) console.log("trying to shift right up", nodeById.get(right.rootId)?.name, "prev?", shifted.get(right.rootId));
                        if (shifted.get(right.rootId) === "down") continue; // would oscillate
                        let best = 0;
                        for (let d = 1; d <= gap; d++) {
                            if (canShift(right.sn, -d)) best = d; else break;
                        }
                        if (best > 0) {
                            shiftSubtree(right.sn, -best);
                            right.minRow -= best;
                            right.maxRow -= best;
                            shifted.set(right.rootId, "up");
                            closed = true;
                            break;
                        }
                    }
                }
                if (closed) break; // restart gap scan
            }

            if (!closed) break; // no more closeable gaps
        }

        // Recenter parent (skip virtual root — no visual node)
        if (pid !== VIRTUAL_ROOT) recenterNode(pid);
    }


    // ── Subtree range computation ──

    const subtreeRanges: SubtreeRange[] = [];
    if (DEV) {
        for (const n of nodes) {
            const kids = finalOrder.get(n.id) ?? [];
            if (kids.length === 0) continue;
            const subtreeNodes = getOwnedSubtreeNodes(n.id);
            const rows = subtreeNodes.map(id => nodeRow.get(id) ?? 0);
            const cols = subtreeNodes.map(id => nodeById.get(id)?.column ?? 0);
            subtreeRanges.push({
                rootId: n.id,
                rootName: n.name,
                startRow: Math.min(...rows),
                endRow: Math.max(...rows),
                startCol: n.column,
                endCol: Math.max(...cols),
                depth: ownerDepth.get(n.id) ?? 0,
            });
        }
    }

    return {positions: pos, subtreeRanges};
}

/**
 * Debug helper — call from the browser console: debugQuestLayout()
 *
 * Output: TSV of nodes (col, absolute row, id, name) sorted by col then row,
 * followed by edge list (source name → target name).
 */
function debugLogLayout(): void {
    const {nodes, edges} = buildQuestGraph();
    const {positions} = computeLayout(nodes, edges);

    const nodeById = new Map<number, QuestGraphNode>();
    for (const n of nodes) nodeById.set(n.id, n);

    const rows: { col: number; row: number; id: number; name: string }[] = [];
    for (const node of nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        rows.push({
            col: node.column,
            row: Math.round(pos.y / ROW_GAP),
            id: node.id,
            name: node.name,
        });
    }

    rows.sort((a, b) => a.col - b.col || a.row - b.row);

    let lastCol = -1;
    const lines: string[] = ["col\trow\tid\tname"];
    for (const r of rows) {
        if (r.col !== lastCol) {
            if (lastCol !== -1) lines.push("");
            lastCol = r.col;
        }
        lines.push(`${r.col}\t${r.row}\t${r.id}\t${r.name}`);
    }

    console.log(lines.join("\n"));

    // Edge list
    const edgeLines: string[] = ["\n--- Edges (source → target) ---"];
    for (const e of edges) {
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        if (src && tgt) edgeLines.push(`${src.name} → ${tgt.name}`);
    }
    console.log(edgeLines.join("\n"));

    console.log(`\n${rows.length} nodes, ${edges.length} edges, ${new Set(rows.map(r => r.col)).size} columns`);
}

// ─── Edge Routing ───────────────────────────────────────────────

function edgePath(
    sx: number, sy: number,
    tx: number, ty: number,
): string {
    const x1 = sx + NODE_W / 2;
    const x2 = tx - NODE_W / 2;
    // Control points at 70% distance from each endpoint → curve flattens
    // (approaches horizontally) at both the source and target nodes.
    const dx = x2 - x1;
    const cx1 = x1 + dx * 0.3;
    const cx2 = x2 - dx * 0.8;
    return `M ${x1} ${sy} C ${cx1} ${sy}, ${cx2} ${ty}, ${x2} ${ty}`;
}

// ─── Graph Builder ──────────────────────────────────────────────

export interface QuestGraphData {
    nodes: QuestGraphNode[];
    edges: QuestGraphEdge[];
}

export function buildQuestGraph(): QuestGraphData {
    const allQuests = BitCraftTables.QuestChainDesc.get() ?? [];

    // Filter: only real quests (not hints, not unstartable)
    const realQuests = allQuests.filter(q => !q.isHint);// && !q.unstartable);

    // Build a set of valid quest IDs for edge filtering
    const validIds = new Set(realQuests.map(q => q.id));

    // Extract quest-to-quest prerequisites
    const questPrereqs = new Map<number, number[]>();
    for (const q of realQuests) {
        const prereqs: number[] = [];
        for (const r of (q.requirements ?? [])) {
            if (r.tag === "QuestChain" && validIds.has(r.value as number)) {
                prereqs.push(r.value as number);
            }
        }
        questPrereqs.set(q.id, prereqs);
    }

    // Compute columns via topological depth
    const depth = new Map<number, number>();

    function getDepth(id: number): number {
        if (depth.has(id)) return depth.get(id)!;
        const prereqs = questPrereqs.get(id) ?? [];
        const d = prereqs.length === 0 ? 0 : Math.max(...prereqs.map(getDepth)) + 1;
        depth.set(id, d);
        return d;
    }

    for (const q of realQuests) getDepth(q.id);

    const nodes: QuestGraphNode[] = realQuests.map(q => ({
        id: q.id,
        name: q.name,
        column: depth.get(q.id) ?? 0,
        questPrereqs: questPrereqs.get(q.id) ?? [],
    }));

    const edges: QuestGraphEdge[] = [];
    for (const q of realQuests) {
        for (const prereqId of (questPrereqs.get(q.id) ?? [])) {
            edges.push({source: prereqId, target: q.id});
        }
    }

    return {nodes, edges};
}

// ─── Component ──────────────────────────────────────────────────

export function QuestGraph(props: QuestGraphProps) {
    let svgRef!: SVGSVGElement;
    let containerRef!: HTMLDivElement;
    let searchWrapperRef: HTMLDivElement | undefined;
    let searchInputRef: HTMLInputElement | undefined;

    const [dims, setDims] = createSignal({w: 900, h: 600});
    const [transformStr, setTransformStr] = createSignal("translate(0,0) scale(1)");
    const [searchQuery, setSearchQuery] = createSignal("");
    const [searchDropdownOpen, setSearchDropdownOpen] = createSignal(false);
    const [searchActiveIdx, setSearchActiveIdx] = createSignal(-1);
    const [treeTarget, setTreeTarget] = createSignal<number | null>(null);
    const [showDebugRanges, setShowDebugRanges] = createSignal(false);

    // Store the zoom behavior for programmatic zoom
    let zoomBehavior: d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null = null;

    // Build graph data
    const graphData = createMemo(() => buildQuestGraph());

    const layoutResult = createMemo(() => computeLayout(graphData().nodes, graphData().edges));
    const nodePositions = createMemo(() => layoutResult().positions);
    const subtreeRanges = createMemo(() => layoutResult().subtreeRanges);

    const questIndex = BitCraftTables.QuestChainDesc.indexedBy("id");

    const {toggleComplete} = questChainCompleter(props.completedQuests, props.setCompletedQuests);

    const matchingNodeIds = createMemo(() => {
        const q = searchQuery().toLowerCase().trim();
        if (!q) return null; // null = show all
        const ids = new Set<number>();
        for (const node of graphData().nodes) {
            if (node.name.toLowerCase().includes(q)) ids.add(node.id);
        }
        return ids;
    });

    const searchSuggestions = createMemo(() => {
        const q = searchQuery().trim().toLowerCase();
        if (!q) return [];
        return graphData().nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 12);
    });

    const hasSuggestions = () => searchDropdownOpen() && searchSuggestions().length;

    function commitSearchSuggestion(nodeId: number) {
        setSearchQuery("");
        setSearchDropdownOpen(false);
        setSearchActiveIdx(-1);
        if (searchInputRef) searchInputRef.value = "";
        props.setChainId?.(nodeId);
        requestAnimationFrame(() => {
            zoomToFit(nodeId);
            setSelectedNode(nodeId);
        });
    }

    function handleSearchKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (searchDropdownOpen()) {
                setSearchDropdownOpen(false);
                setSearchActiveIdx(-1);
            } else {
                setSearchQuery("");
            }
            return;
        }
        if (!hasSuggestions()) return;
        const items = searchSuggestions();
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSearchActiveIdx(i => Math.min(i + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSearchActiveIdx(i => Math.max(i - 1, -1));
        } else if (e.key === "Enter") {
            const idx = searchActiveIdx();
            if (idx >= 0 && items[idx]) {
                e.preventDefault();
                commitSearchSuggestion(items[idx].id);
            }
        }
    }

    const stagesMap = stagesByChain();
    const treeResult = createMemo(() => {
        const target = treeTarget();
        if (target === null) return null;
        return computeQuestTree(target, props.completedQuests(), questIndex(), stagesMap());
    });

    type DimLevel = "none" | "partial" | "full";

    const getDimLevel = (nodeId: number): DimLevel => {
        const tree = treeResult();
        const search = matchingNodeIds();

        if (tree !== null) {
            if (!tree.allTreeQuestIds.has(nodeId)) return "full";
            const matchesSearch = search === null || search.has(nodeId);
            return matchesSearch ? "none" : "partial";
        }

        if (search !== null) {
            return search.has(nodeId) ? "none" : "full";
        }

        return "none";
    };

    const NODE_DIM_OPACITY = {none: 1, partial: 0.52, full: 0.11} as const;
    const TEXT_DIM_OPACITY = {none: 1, partial: 0.55, full: 0.15} as const;
    const EDGE_DIM_OPACITY = {none: 0.5, partial: 0.18, full: 0.06} as const;

    // Node hover / selection (popover open) tracking for edge highlighting
    const [hoveredNode, setHoveredNode] = createSignal<number | null>(null);
    const [selectedNode, setSelectedNode] = createSignal<number | null>(null);

    /** True when either endpoint of an edge is the hovered or open-popover node */
    const isEdgeActive = (srcId: number, tgtId: number): boolean => {
        const h = hoveredNode();
        const s = selectedNode();
        return srcId === h || tgtId === h || srcId === s || tgtId === s;
    };

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
        zoomBehavior = d3Zoom.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.05, 3])
            .on("zoom", event => setTransformStr(event.transform.toString()));
        svg.call(zoomBehavior as any);
        onCleanup(() => svg.on(".zoom", null));

        // Close search dropdown on outside click
        const onPointerDownDoc = (e: PointerEvent) => {
            if (searchWrapperRef && !searchWrapperRef.contains(e.target as Node)) {
                setSearchDropdownOpen(false);
                setSearchActiveIdx(-1);
            }
        };
        document.addEventListener("pointerdown", onPointerDownDoc);
        onCleanup(() => document.removeEventListener("pointerdown", onPointerDownDoc));

        // Initial zoom to fit content — instant (no animation on first load)
        requestAnimationFrame(() => {
            zoomToFit(undefined, true);
        });
    });

    // Width reserved for the quest tree panel when open
    const TREE_PANEL_W = 380;

    /**
     * Compute a zoom transform that fits the given node positions into
     * `availW × h` with `pad` pixels of padding and a max scale of `maxScale`.
     * Returns null if the positions array is empty.
     */
    function computeFitTransform(
        positions: { x: number; y: number }[],
        availW: number,
        h: number,
        pad: number,
        maxScale: number,
    ): d3Zoom.ZoomTransform | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of positions) {
            minX = Math.min(minX, p.x - NODE_W / 2);
            minY = Math.min(minY, p.y - NODE_H / 2);
            maxX = Math.max(maxX, p.x + NODE_W / 2);
            maxY = Math.max(maxY, p.y + NODE_H / 2);
        }
        if (minX === Infinity) return null;
        const contentW = maxX - minX + pad * 2;
        const contentH = maxY - minY + pad * 2;
        const scale = Math.min(availW / contentW, h / contentH, maxScale);
        const tx = (availW - contentW * scale) / 2 - (minX - pad) * scale;
        const ty = (h - contentH * scale) / 2 - (minY - pad) * scale;
        return d3Zoom.zoomIdentity.translate(tx, ty).scale(scale);
    }

    /**
     * Apply a zoom transform, animated unless `instant` is true or the user
     * has `prefers-reduced-motion: reduce` enabled.
     */
    function applyZoom(transform: d3Zoom.ZoomTransform, instant = false) {
        if (!zoomBehavior || !svgRef) return;
        const svg = d3Selection.select(svgRef);
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const duration = (instant || prefersReduced) ? 0 : 500;
        // .transition() is augmented onto Selection by the "d3-transition" import
        const t = (svg as any).transition().duration(duration);
        zoomBehavior.transform(t, transform);
    }

    function zoomToFit(targetId?: number, instant = false) {
        if (!zoomBehavior || !svgRef) return;
        const positions = nodePositions();
        const {w, h} = dims();

        if (targetId !== undefined) {
            // Zoom to specific node at fixed scale
            const pos = positions.get(targetId);
            if (!pos) return;
            const scale = 1.5;
            const tx = w / 2 - pos.x * scale;
            const ty = h / 2 - pos.y * scale;
            applyZoom(d3Zoom.zoomIdentity.translate(tx, ty).scale(scale), instant);
            return;
        }

        // Fit all nodes — reserve right margin for the quest tree panel when open
        const availW = treeTarget() !== null ? Math.max(w - TREE_PANEL_W, w * 0.55) : w;
        const items = [...positions.values()];
        if (items.length === 0) return;
        const t = computeFitTransform(items, availW, h, 50, 1);
        if (t) applyZoom(t, instant);
    }

    /** Zoom to fit a specific subset of nodes (e.g. a quest tree). */
    function zoomToFitNodes(nodeIds: Set<number>) {
        if (!zoomBehavior || !svgRef) return;
        const positions = nodePositions();
        const {w, h} = dims();
        // Always reserve right margin — the tree panel is open when this is called
        const availW = Math.max(w - TREE_PANEL_W, w * 0.55);
        const items: { x: number; y: number }[] = [];
        for (const id of nodeIds) {
            const p = positions.get(id);
            if (p) items.push(p);
        }
        if (items.length === 0) return;
        const t = computeFitTransform(items, availW, h, 80, 2);
        if (t) applyZoom(t);
    }

    // Zoom to focused chain on load (one-shot: runs once positions are populated)
    let focusApplied = false;
    createEffect(() => {
        const id = props.focusChainId;
        const positions = nodePositions();
        if (!focusApplied && id && positions.has(id)) {
            focusApplied = true;
            requestAnimationFrame(() => {
                zoomToFit(id, true);
                setSelectedNode(id);
            });
        }
    });

    return (
        <div
            ref={containerRef!}
            class="relative flex flex-col flex-1 min-h-0 rounded-lg border bg-background overflow-hidden"
            style="min-height: 500px"
        >
            {/* Search bar + debug toggle */}
            <div class="absolute top-3 left-3 z-10 flex items-center gap-2">
                <div ref={searchWrapperRef} class="relative">
                    <div class="flex items-center bg-background/95 border rounded-md px-2 py-1.5 text-sm">
                        <IconSearch class="size-4 text-muted-foreground mr-1.5"/>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search quests..."
                            class="bg-transparent outline-none w-48 text-sm"
                            value={searchQuery()}
                            onInput={e => {
                                const val = e.currentTarget.value;
                                setSearchQuery(val);
                                setSearchDropdownOpen(!!val.trim());
                                setSearchActiveIdx(-1);
                            }}
                            onKeyDown={handleSearchKeyDown}
                            onFocus={() => {
                                if (searchQuery().trim()) setSearchDropdownOpen(true);
                            }}
                        />
                        <Show when={searchQuery()}>
                            <button
                                class="text-muted-foreground hover:text-foreground ml-1"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSearchDropdownOpen(false);
                                    setSearchActiveIdx(-1);
                                    if (searchInputRef) searchInputRef.value = "";
                                }}
                            >
                                <IconX class="size-3.5"/>
                            </button>
                        </Show>
                    </div>
                    <Show when={hasSuggestions()}>
                        <div class="absolute top-full mt-1 left-0 min-w-full bg-popover border border-border rounded-md shadow-lg z-50">
                            <ul class="py-1 max-h-60 overflow-y-auto" role="listbox">
                                <For each={searchSuggestions()}>
                                    {(node, i) => {
                                        const isActive = () => searchActiveIdx() === i();
                                        return (
                                            <li
                                                role="option"
                                                aria-selected={isActive()}
                                                class={cn(
                                                    "px-3 py-1.5 text-sm cursor-pointer truncate transition-colors",
                                                    isActive() ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                                                )}
                                                onPointerDown={(e) => {
                                                    e.preventDefault();
                                                    commitSearchSuggestion(node.id);
                                                }}
                                                onMouseEnter={() => setSearchActiveIdx(i())}
                                            >
                                                {node.name}
                                            </li>
                                        );
                                    }}
                                </For>
                            </ul>
                        </div>
                    </Show>
                </div>
                <Show when={DEV}>
                    <button
                        class={`px-2 py-1.5 text-xs rounded-md border bg-background/95 transition-colors ${showDebugRanges() ? "border-blue-500 text-blue-500" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setShowDebugRanges(v => !v)}
                        title="Toggle subtree bounds"
                    >
                        subtrees
                    </button>
                    <button
                        class="px-2 py-1.5 text-xs rounded-md border bg-background/95 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => debugLogLayout()}
                        title="Log layout to console"
                    >
                        log layout
                    </button>
                </Show>
            </div>

            {/* Tree results panel */}
            <Show when={treeResult()}>
                {(result) => {
                    const targetQuest = () => questIndex().get(treeTarget()!);
                    return (
                        <div class="absolute top-3 right-3 z-10 bg-background/95 border rounded-md px-4 py-3 text-sm max-w-sm max-h-[60vh] overflow-auto select-none">
                            <div class="flex items-center justify-between mb-2">
                                <div class="text-xs text-muted-foreground">
                                    Quest tree for: <span class="font-medium text-foreground">{targetQuest()?.name}</span>
                                </div>
                                <button
                                    class="text-muted-foreground hover:text-foreground ml-2"
                                    onClick={() => setTreeTarget(null)}
                                >
                                    <IconX class="size-3.5"/>
                                </button>
                            </div>
                            <div class="text-xs text-muted-foreground mb-1">
                                {result().involvedQuestIds.size} incomplete quest{result().involvedQuestIds.size !== 1 ? "s" : ""}
                            </div>
                            <Show when={result().requirements.length}>
                                <div class="mt-2">
                                    <div class="text-xs font-medium text-muted-foreground mb-1">Requirements:</div>
                                    <div class="flex flex-col gap-0.5 ml-2">
                                        <For each={result().requirements}>
                                            {(r) => (
                                                <div class="text-xs"><ReqOrRewardLink qr={r}/></div>
                                            )}
                                        </For>
                                    </div>
                                </div>
                            </Show>
                            <Show when={result().rewards.length}>
                                <div class="mt-2">
                                    <div class="text-xs font-medium text-muted-foreground mb-1">Rewards:</div>
                                    <div class="flex flex-col gap-0.5 ml-2">
                                        <For each={result().rewards}>
                                            {(r) => (
                                                <div class="text-xs"><ReqOrRewardLink qr={r}/></div>
                                            )}
                                        </For>
                                    </div>
                                </div>
                            </Show>
                        </div>
                    );
                }}
            </Show>

            <div class="absolute bottom-3 right-3 z-10 text-xs text-muted-foreground/60 pointer-events-none select-none">
                scroll to zoom · drag to pan · click a quest for details
            </div>

            <svg
                ref={svgRef!}
                width="100%" height="100%"
                style="display:block;flex:1;min-height:0"
            >
                <defs>
                    <marker id="arrow-quest" viewBox="0 -5 10 10" refX={10} refY={0}
                            markerWidth={6} markerHeight={6} orient="auto">
                        <path d="M0,-5L10,0L0,5" fill={EDGE_COLOR}/>
                    </marker>
                </defs>

                <g transform={transformStr()}>
                    {/* Debug: subtree bounding boxes */}
                    <Show when={showDebugRanges()}>
                        <For each={subtreeRanges()}>
                            {(range) => {
                                const PAD = 10;
                                const hue = (range.rootId * 137.508) % 360;
                                const rx = range.startCol * COL_GAP - NODE_W / 2 - PAD;
                                const ry = range.startRow * ROW_GAP - NODE_H / 2 - PAD;
                                const rw = (range.endCol - range.startCol) * COL_GAP + NODE_W + PAD * 2;
                                const rh = (range.endRow - range.startRow) * ROW_GAP + NODE_H + PAD * 2;
                                const fillOp = Math.max(0.03, 0.08 - range.depth * 0.015);
                                const strokeOp = Math.max(0.12, 0.35 - range.depth * 0.06);
                                return (
                                    <g style="pointer-events:none">
                                        <rect
                                            x={rx} y={ry} width={rw} height={rh}
                                            rx={8}
                                            fill={`hsl(${hue} 55% 60%)`}
                                            fill-opacity={fillOp}
                                            stroke={`hsl(${hue} 55% 50%)`}
                                            stroke-opacity={strokeOp}
                                            stroke-width={1.5}
                                        />
                                        <text
                                            x={rx + 6} y={ry + 12}
                                            font-size="9"
                                            fill={`hsl(${hue} 55% 40%)`}
                                            fill-opacity={Math.min(1, strokeOp * 1.5)}
                                            style="pointer-events:none;font-family:system-ui"
                                        >
                                            {range.rootName}
                                        </text>
                                    </g>
                                );
                            }}
                        </For>
                    </Show>

                    {/* Edges — base layer (dim/normal opacity) */}
                    <For each={graphData().edges}>
                        {(edge) => {
                            const src = () => nodePositions().get(edge.source);
                            const tgt = () => nodePositions().get(edge.target);
                            const edgeOpacity = () => {
                                // Active edges are drawn in the highlight layer below
                                if (isEdgeActive(edge.source, edge.target)) return 0;
                                const sl = getDimLevel(edge.source);
                                const tl = getDimLevel(edge.target);
                                if (sl === "full" || tl === "full") return EDGE_DIM_OPACITY.full;
                                if (sl === "partial" || tl === "partial") return EDGE_DIM_OPACITY.partial;
                                return EDGE_DIM_OPACITY.none;
                            };
                            return (
                                <Show when={src() && tgt()}>
                                    <path
                                        d={edgePath(src()!.x, src()!.y, tgt()!.x, tgt()!.y)}
                                        fill="none"
                                        stroke={EDGE_COLOR}
                                        opacity={edgeOpacity()}
                                        stroke-width={1.2}
                                        marker-end="url(#arrow-quest)"
                                        style="pointer-events:none"
                                    />
                                </Show>
                            );
                        }}
                    </For>

                    {/* Nodes */}
                    <For each={graphData().nodes}>
                        {(node) => {
                            const pos = () => nodePositions().get(node.id) ?? {x: 0, y: 0};
                            const isComplete = () => props.completedQuests().has(node.id);
                            const dimLevel = () => getDimLevel(node.id);
                            const nodeOp = () => NODE_DIM_OPACITY[dimLevel()];
                            const textOp = () => TEXT_DIM_OPACITY[dimLevel()];
                            const quest = () => questIndex().get(node.id);

                            // Non-quest requirements for popover
                            const nonQuestReqs = () => {
                                const q = quest();
                                if (!q) return [];
                                return (q.requirements ?? []).filter(r => r.tag !== "PaddingNone" && r.tag !== "QuestChain");
                            };

                            // Quest prereqs for popover
                            const questReqs = () => {
                                const q = quest();
                                if (!q) return [];
                                return (q.requirements ?? []).filter(r => r.tag === "QuestChain") as QuestRequirement.QuestChain[];
                            };

                            const allRewards = () => {
                                const q = quest();
                                if (!q) return [];
                                return [...(q.rewards ?? []), ...(q.implicitRewards ?? [])].filter(r => r.tag !== "PaddingNone");
                            };

                            // Truncate long names
                            const displayName = () => {
                                const name = node.name;
                                return name.length > 25 ? name.slice(0, 23) + "…" : name;
                            };

                            return (
                                <Popover
                                    placement="right"
                                    slide={true}
                                    fitViewport={true}
                                    open={selectedNode() === node.id}
                                    onOpenChange={(open) => {
                                        if (open) {
                                            setSelectedNode(node.id);
                                            props.setChainId?.(node.id);
                                        } else if (selectedNode() === node.id) {
                                            setSelectedNode(null);
                                        }
                                    }}
                                >
                                    <PopoverTrigger
                                        as="g"
                                        transform={`translate(${pos().x - NODE_W / 2},${pos().y - NODE_H / 2})`}
                                        style="cursor:pointer"
                                        onMouseEnter={() => setHoveredNode(node.id)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                    >
                                        {/* Card background */}
                                        <rect
                                            x={0} y={0}
                                            width={NODE_W} height={NODE_H}
                                            rx={6}
                                            class={cn(
                                                "stroke-border",
                                                isComplete() ? "fill-[hsl(130_25%_92%)] dark:fill-[hsl(130_20%_18%)]" : "fill-card",
                                            )}
                                            opacity={nodeOp()}
                                            stroke-width={1}
                                        />
                                        {/* Hover / selected ring */}
                                        <Show when={hoveredNode() === node.id || selectedNode() === node.id}>
                                            <rect
                                                x={-2} y={-2}
                                                width={NODE_W + 4} height={NODE_H + 4}
                                                rx={8}
                                                fill="none"
                                                stroke={EDGE_COLOR}
                                                stroke-width={2}
                                                opacity={0.7}
                                                style="pointer-events:none"
                                            />
                                        </Show>
                                        {/* Status icon */}
                                        <Show when={isComplete()}>
                                            <foreignObject x={4} y={(NODE_H - 16) / 2} width={16} height={16}
                                                           style="pointer-events:none">
                                                <IconCheck class="size-4 text-green-600 dark:text-green-400"/>
                                            </foreignObject>
                                        </Show>
                                        {/* Quest name */}
                                        <text
                                            x={isComplete() ? 24 : 8} y={NODE_H / 2}
                                            dominant-baseline="middle"
                                            font-size="11"
                                            fill="currentColor"
                                            opacity={textOp()}
                                            style="pointer-events:none;font-family:system-ui"
                                        >
                                            {displayName()}
                                        </text>
                                    </PopoverTrigger>
                                    <PopoverContent class="w-80 p-3">
                                        <div class="flex flex-col gap-2">
                                            {/* Title */}
                                            <QuestChainLink id={node.id} name={node.name}/>

                                            {/* Complete checkbox */}
                                            <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={isComplete()}
                                                    onChange={() => toggleComplete(node.id)}
                                                    class="accent-green-600"
                                                />
                                                <span class={isComplete() ? "text-green-600 dark:text-green-400" : ""}>
                                                    {isComplete() ? "Completed" : "Mark as complete"}
                                                </span>
                                            </label>

                                            {/* Quest prerequisites */}
                                            <Show when={questReqs().length}>
                                                <div>
                                                    <div class="text-xs font-medium text-muted-foreground mb-0.5">Required Quests:</div>
                                                    <LinkedList>
                                                        {questReqs().map(r => <ReqOrRewardLink qr={r}/>)}
                                                    </LinkedList>
                                                </div>
                                            </Show>

                                            {/* Other requirements */}
                                            <Show when={nonQuestReqs().length}>
                                                <div>
                                                    <div class="text-xs font-medium text-muted-foreground mb-0.5">Other Requirements:</div>
                                                    <LinkedList>
                                                        {nonQuestReqs().map(r => <ReqOrRewardLink qr={r}/>)}
                                                    </LinkedList>
                                                </div>
                                            </Show>

                                            {/* Rewards */}
                                            <Show when={allRewards().length}>
                                                <div>
                                                    <div class="text-xs font-medium text-muted-foreground mb-0.5">Rewards:</div>
                                                    <LinkedList>
                                                        {allRewards().map(r => <ReqOrRewardLink qr={r}/>)}
                                                    </LinkedList>
                                                </div>
                                            </Show>

                                            {/* View quest tree button */}
                                            <Show when={!isComplete()}>
                                                <button
                                                    class="mt-1 text-xs px-3 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors text-foreground w-full"
                                                    onClick={() => {
                                                        setTreeTarget(node.id);
                                                        setSelectedNode(null); // close popover
                                                        requestAnimationFrame(() => zoomToFitNodes(getQuestTreeIds(node.id, questIndex())));
                                                    }}
                                                >
                                                    View quest tree
                                                </button>
                                            </Show>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            );
                        }}
                    </For>

                    {/* Highlighted edges — drawn on top of nodes so they're clearly visible */}
                    <For each={graphData().edges}>
                        {(edge) => {
                            const src = () => nodePositions().get(edge.source);
                            const tgt = () => nodePositions().get(edge.target);
                            return (
                                <Show when={isEdgeActive(edge.source, edge.target) && src() && tgt()}>
                                    <path
                                        d={edgePath(src()!.x, src()!.y, tgt()!.x, tgt()!.y)}
                                        fill="none"
                                        stroke={EDGE_COLOR}
                                        opacity={0.9}
                                        stroke-width={2.5}
                                        marker-end="url(#arrow-quest)"
                                        style="pointer-events:none"
                                    />
                                </Show>
                            );
                        }}
                    </For>
                </g>
            </svg>
        </div>
    );
}
