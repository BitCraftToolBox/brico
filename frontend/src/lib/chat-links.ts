/**
 * In-game chat links: `(prefix=id)` strings the game client renders as clickable references.
 * Maps each prefix to the database page it identifies.
 */

import {BitCraftTables} from "~/lib/bitcraft-data";
import type {SidebarHrefs} from "~/lib/sidebar-items";

export interface ChatLinkKind {
    /** Detail page family the link points at. */
    route: SidebarHrefs;
    /** Converts the chat link id to the page's primary key when they differ. */
    toPk?: (id: number) => number | undefined;
}

export const CHAT_LINK_KINDS = {
    item: {route: "/database/item"},
    cargo: {route: "/database/cargo"},
    mob: {route: "/database/creature"},
    res: {route: "/database/resource"},
    build: {route: "/database/building"},
    coll: {route: "/database/collectible"},
    ability: {route: "/database/ability"},
    prof: {route: "/database/skill"},
    quest: {route: "/database/quest-chain"},
    // Knowledge links carry the scroll's item id, not the secondary knowledge id.
    know: {
        route: "/database/knowledge",
        toPk: (itemId) => BitCraftTables.KnowledgeScrollDesc.indexedBy("itemId")().get(itemId)?.secondaryKnowledgeId,
    },
} as const satisfies Record<string, ChatLinkKind>;

export type ChatLinkPrefix = keyof typeof CHAT_LINK_KINDS;

const CHAT_LINK_RE = /^\(\s*([a-z]+)\s*=\s*(\d+)\s*\)$/i;

/** Formats a chat link, or `undefined` while the id is not yet known. */
export function chatLink(prefix: ChatLinkPrefix, id: string | number | null | undefined): string | undefined {
    return id === undefined || id === null || id === "" ? undefined : `(${prefix}=${id})`;
}

/** Parses a whole-string chat link such as `(item=123)`; `null` for anything else or an unknown prefix. */
export function parseChatLink(text: string): { prefix: ChatLinkPrefix; id: number } | null {
    const match = CHAT_LINK_RE.exec(text.trim());
    if (!match) return null;
    const prefix = match[1].toLowerCase();
    if (!Object.hasOwn(CHAT_LINK_KINDS, prefix)) return null;
    const id = Number(match[2]);
    return Number.isSafeInteger(id) ? {prefix: prefix as ChatLinkPrefix, id} : null;
}

/** Resolves a parsed chat link to its page route and primary key. */
export function resolveChatLink(link: { prefix: ChatLinkPrefix; id: number }): { route: SidebarHrefs; pk: number } | null {
    const kind: ChatLinkKind = CHAT_LINK_KINDS[link.prefix];
    const pk = kind.toPk ? kind.toPk(link.id) : link.id;
    return pk === undefined ? null : {route: kind.route, pk};
}
