/**
 * feed.ts — the shape of a table mirror's row feed, and the wiring from SpacetimeDB row callbacks into it.
 */

/** What a table's row callbacks feed in. `update` carries the whole before/after pair like the SDK's `onUpdate`. */
export interface TableFeed<T> {
    insert(row: T): void;
    update(before: T, after: T): void;
    delete(row: T): void;
}

/** The slice of a generated table the row callbacks attach to. */
export interface RowEvents<T> {
    onInsert(cb: (ctx: {event: {tag: string}}, row: T) => void): void;
    onDelete(cb: (ctx: {event: {tag: string}}, row: T) => void): void;
    onUpdate(cb: (ctx: {event: {tag: string}}, before: T, after: T) => void): void;
}

/**
 * Forwards `table`'s row callbacks to `target` whenever `accepts` allows, then calls `onChange`
 * (for an update, only when `changed(before, after)`).
 */
export function attachFeed<T>(
    table: RowEvents<T>,
    target: TableFeed<T>,
    accepts: (ctx: {event: {tag: string}}) => boolean,
    onChange: () => void = () => {},
    changed: (before: T, after: T) => boolean = () => true,
): void {
    table.onInsert((ctx, row) => {
        if (!accepts(ctx)) return;
        target.insert(row);
        onChange();
    });
    table.onDelete((ctx, row) => {
        if (!accepts(ctx)) return;
        target.delete(row);
        onChange();
    });
    table.onUpdate((ctx, before, after) => {
        if (!accepts(ctx)) return;
        target.update(before, after);
        if (changed(before, after)) onChange();
    });
}

/** A feed for a table keyed by `key`: an update that moves a row to a different key removes the old key first, like the SDK's table cache. */
export function keyedFeed<T>(key: (row: T) => unknown, set: (row: T) => void, remove: (row: T) => void): TableFeed<T> {
    return {
        insert: set,
        update: (before, after) => {
            if (key(before) !== key(after)) remove(before);
            set(after);
        },
        delete: remove,
    };
}
