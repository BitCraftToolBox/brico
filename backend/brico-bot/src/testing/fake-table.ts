/**
 * fake-table.ts — an in-memory keyed table for tests that fires a `TableFeed` on every operation, like the SDK's row callbacks.
 */
import type {TableFeed} from "../spacetime/feed.ts";

export function fakeTable<T>(key: (row: T) => string, feed: TableFeed<T>) {
    const rows = new Map<string, T>();
    return {
        rows,
        iter: () => rows.values(),
        upsert(row: T) {
            const before = rows.get(key(row));
            rows.set(key(row), row);
            if (before) feed.update(before, row);
            else feed.insert(row);
        },
        remove(k: string) {
            const before = rows.get(k);
            if (!before) return;
            rows.delete(k);
            feed.delete(before);
        },
    };
}
