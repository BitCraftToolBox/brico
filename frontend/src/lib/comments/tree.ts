/** tree.ts — groups a page's flat comment rows into reply threads. */

export interface TreeRow {
    id: bigint;
    parentId: bigint | undefined;
    createdAt: { microsSinceUnixEpoch: bigint };
    score: number;
}

/** A comment with its replies; `row` is `undefined` for a placeholder standing in for a removed parent. */
export interface CommentNode<T extends TreeRow> {
    id: bigint;
    row: T | undefined;
    children: CommentNode<T>[];
}

export type TopLevelOrder = "newest" | "oldest" | "score";

/**
 * Builds the thread forest. Readers never receive hidden or deleted rows, so a reply whose
 * parent is absent hangs off a placeholder node (`row: undefined`) at the top level. Replies are
 * oldest first; the top level follows `order`, except placeholders always come after real
 * comments. A placeholder is ordered by its oldest reply's time, and has no score, so under
 * `"score"` placeholders fall back to newest first.
 */
export function buildCommentTree<T extends TreeRow>(rows: readonly T[], order: TopLevelOrder): CommentNode<T>[] {
    const nodes = new Map<bigint, CommentNode<T>>();
    for (const row of rows) nodes.set(row.id, {id: row.id, row, children: []});

    const roots: CommentNode<T>[] = [];
    for (const row of rows) {
        const node = nodes.get(row.id)!;
        if (row.parentId === undefined) {
            roots.push(node);
            continue;
        }
        let parent = nodes.get(row.parentId);
        if (parent === undefined) {
            parent = {id: row.parentId, row: undefined, children: []};
            nodes.set(row.parentId, parent);
            roots.push(parent);
        }
        parent.children.push(node);
    }

    const created = (node: CommentNode<T>) => node.row?.createdAt.microsSinceUnixEpoch
        ?? node.children[0]?.row?.createdAt.microsSinceUnixEpoch
        ?? 0n;
    const oldestFirst = (a: CommentNode<T>, b: CommentNode<T>) => compare(created(a), created(b)) || compare(a.id, b.id);
    const highestScore = (a: CommentNode<T>, b: CommentNode<T>) => compareScore(a.row?.score, b.row?.score) || oldestFirst(b, a); // score then newest

    const sortReplies = (node: CommentNode<T>) => {
        node.children.sort(oldestFirst);
        node.children.forEach(sortReplies);
    };
    roots.forEach(sortReplies);
    const byOrder = order === "oldest" ? oldestFirst : order === "newest" ? (a: CommentNode<T>, b: CommentNode<T>) => oldestFirst(b, a) : highestScore;
    roots.sort((a, b) => Number(a.row === undefined) - Number(b.row === undefined) || byOrder(a, b));
    return roots;
}

function compare(a: bigint, b: bigint): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareScore(a: number | undefined, b: number | undefined): number {
    return a === undefined || b === undefined ? 0 : a > b ? -1 : a < b ? 1 : 0;
}