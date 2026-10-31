/** page-target.ts — resolves a comment page key to the database entry it belongs to. */
import {BitCraftTables} from "~/lib/bitcraft-data";
import {gameLinkFallback} from "~/lib/comments/markdown";
import {searchableTables} from "~/lib/global-search";
import {PAGE_TITLE_LABELS, SIDEBAR_GROUPS, type SidebarPages} from "~/lib/sidebar-items";

export interface CommentPageTarget {
    href: string;
    /** The sidebar page the entry belongs to, for its icon. */
    title: SidebarPages;
    name: string;
}

/**
 * The database page `"<route segment>:<id>"` names, or `undefined` when the segment isn't a
 * sidebar database route, has no searchable table, or the entry doesn't exist. Reads the game
 * tables, so call it from a reactive scope.
 */
export function resolveCommentPage(pageKey: string): CommentPageTarget | undefined {
    const [kind, id] = pageKey.split(":");
    const route = `/database/${kind}`;
    if (!Object.hasOwn(PAGE_TITLE_LABELS, route)) return undefined;
    const table = searchableTables.find(t => t.route === route);
    const item = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.href === route);
    if (!table || !item) return undefined;
    // @ts-ignore the table key and primary key field are paired in `searchableTables`
    const row = BitCraftTables[table.tableKey].indexedBy(table.pk)().get(Number(id));
    return row ? {href: `${route}/${id}`, title: item.title as SidebarPages, name: table.name(row)} : undefined;
}

/**
 * Like `resolveCommentPage`, but a database page whose entry isn't in the loaded game data (not
 * loaded yet, or removed) still resolves, named by `gameLinkFallback`. `undefined` only when the key
 * isn't a database page at all.
 */
export function resolveGameLink(pageKey: string): CommentPageTarget | undefined {
    const resolved = resolveCommentPage(pageKey);
    if (resolved) return resolved;
    const [kind, id] = pageKey.split(":");
    const route = `/database/${kind}`;
    const item = SIDEBAR_GROUPS.flatMap(g => g.items).find(i => i.href === route);
    if (!item || !searchableTables.some(t => t.route === route)) return undefined;
    return {href: `${route}/${id}`, title: item.title as SidebarPages, name: gameLinkFallback(pageKey)};
}
