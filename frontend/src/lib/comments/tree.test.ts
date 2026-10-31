import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {buildCommentTree, type TreeRow} from "./tree.ts";

const row = (id: number, parentId: number | undefined, at: number, score = 0): TreeRow => ({
    id: BigInt(id),
    parentId: parentId === undefined ? undefined : BigInt(parentId),
    createdAt: {microsSinceUnixEpoch: BigInt(at)},
    score,
});

const shape = (nodes: ReturnType<typeof buildCommentTree>): unknown[] =>
    nodes.map(n => [Number(n.id), n.row === undefined ? "removed" : "ok", ...(n.children.length ? [shape(n.children)] : [])]);

describe("buildCommentTree", () => {
    const rows = [row(1, undefined, 10), row(2, 1, 30), row(3, 1, 20), row(4, undefined, 40)];

    it("nests replies oldest first", () => {
        assert.deepEqual(shape(buildCommentTree(rows, "oldest")), [[1, "ok", [[3, "ok"], [2, "ok"]]], [4, "ok"]]);
    });

    it("orders the top level newest first without reordering replies", () => {
        assert.deepEqual(shape(buildCommentTree(rows, "newest")), [[4, "ok"], [1, "ok", [[3, "ok"], [2, "ok"]]]]);
    });

    it("orders the top level by highest score, breaking ties newest first", () => {
        const scored = [row(1, undefined, 10, 5), row(2, undefined, 20, 5), row(3, undefined, 30, -1), row(4, undefined, 40, 9)];
        assert.deepEqual(shape(buildCommentTree(scored, "score")), [[4, "ok"], [2, "ok"], [1, "ok"], [3, "ok"]]);
    });

    it("keeps replies oldest first regardless of score", () => {
        const scored = [row(1, undefined, 10), row(2, 1, 20, 9), row(3, 1, 30, 1)];
        assert.deepEqual(shape(buildCommentTree(scored, "score")), [[1, "ok", [[2, "ok"], [3, "ok"]]]]);
    });

    it("synthesizes a placeholder for a missing parent, ordered by its oldest reply", () => {
        const orphaned = [row(5, 98, 15), row(6, 98, 12), row(7, 99, 11)];
        assert.deepEqual(shape(buildCommentTree(orphaned, "oldest")), [[99, "removed", [[7, "ok"]]], [98, "removed", [[6, "ok"], [5, "ok"]]]]);
        assert.deepEqual(shape(buildCommentTree(orphaned, "newest")), [[98, "removed", [[6, "ok"], [5, "ok"]]], [99, "removed", [[7, "ok"]]]]);
    });

    it("sorts placeholders after real comments for every order", () => {
        const mixed = [row(5, 99, 1, 100), row(6, 99, 2), row(7, undefined, 14, -5), row(8, undefined, 13, 3)];
        assert.deepEqual(shape(buildCommentTree(mixed, "oldest")), [[8, "ok"], [7, "ok"], [99, "removed", [[5, "ok"], [6, "ok"]]]]);
        assert.deepEqual(shape(buildCommentTree(mixed, "newest")), [[7, "ok"], [8, "ok"], [99, "removed", [[5, "ok"], [6, "ok"]]]]);
        assert.deepEqual(shape(buildCommentTree(mixed, "score")), [[8, "ok"], [7, "ok"], [99, "removed", [[5, "ok"], [6, "ok"]]]]);
    });

    it("handles deeper nesting when the depth limit allows it", () => {
        const deep = [row(1, undefined, 1), row(2, 1, 2), row(3, 2, 3)];
        assert.deepEqual(shape(buildCommentTree(deep, "oldest")), [[1, "ok", [[2, "ok", [[3, "ok"]]]]]]);
    });

    it("is empty for no rows", () => assert.deepEqual(buildCommentTree([], "newest"), []));
});
