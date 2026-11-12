/** author.ts — the "Posting as" preview; mirrors the module's `resolveAuthorName`. */
import {checkDisplayName} from "@brico/crafts/comments";

export interface LinkHandle {
    provider: string;
    externalHandle: string | undefined;
    linkedAt: { microsSinceUnixEpoch: bigint };
}

function oldestHandle(links: readonly LinkHandle[], provider: string): string | undefined {
    let oldest: LinkHandle | undefined;
    for (const link of links) {
        if (link.provider !== provider || !link.externalHandle) continue;
        if (oldest === undefined || link.linkedAt.microsSinceUnixEpoch < oldest.linkedAt.microsSinceUnixEpoch) oldest = link;
    }
    return oldest?.externalHandle;
}

/**
 * The name a new comment would be posted under, or `undefined` if the account has none: a valid
 * display name, else the oldest BitCraft handle, else a Discord handle. `activeLinks` must exclude
 * revoked links. The module decides; this only previews it.
 */
export function previewAuthorName(displayName: string | undefined, activeLinks: readonly LinkHandle[]): string | undefined {
    if (displayName !== undefined) {
        const checked = checkDisplayName(displayName);
        if ("name" in checked) return checked.name;
    }
    return oldestHandle(activeLinks, "bitcraft-rel") ?? oldestHandle(activeLinks, "discord");
}
