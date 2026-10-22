/**
 * link-state-store.ts — correlates an OAuth `state` param to the brico link it belongs to, across
 * the redirect round trip to BitAuth/Discord and back.
 *
 * Deliberately separate from `brico-app`'s own `integration_link_request` table: that table
 * correlates a *link code* (`beginIntegrationLink`'s `code`) to a brico account and an eventual
 * external id, and lives in the module so both this process and the browser can see it. This store
 * correlates the *OAuth* `state`/PKCE `code_verifier` to that same link code only while a redirect
 * is in flight — neither BitAuth nor Discord know brico's link codes, so something on this side has
 * to remember which pending link a given `state` belongs to when the callback comes back. Purely
 * in-memory: a restart mid-flow just means the user's redirect 404s and they retry, same as an
 * abandoned tab already does to `integration_link_request`'s own TTL.
 */

export interface PendingOAuthLink {
    linkCode: string;
    /** Only BitAuth's flow needs this (Discord's OAuth handshake has no PKCE step here). */
    codeVerifier?: string;
    /** The already-validated return URL the login request asked for; `undefined` means "use the
     * configured default" (see `resolveReturnUrl` in `http-server.ts`). */
    returnUrl?: string;
    createdAt: number;
}

export interface LinkStateStore {
    put(state: string, entry: Omit<PendingOAuthLink, "createdAt">): void;
    /** One-shot: a `state` is consumed by its callback and cannot be replayed. */
    take(state: string): PendingOAuthLink | undefined;
}

/** Same TTL as `integration_link_request`'s own expiry (see `LINK_TTL_MICROS` in the module). */
const STATE_TTL_MS = 15 * 60 * 1000;

export function createLinkStateStore(): LinkStateStore {
    const entries = new Map<string, PendingOAuthLink>();

    function sweep(): void {
        const cutoff = Date.now() - STATE_TTL_MS;
        for (const [state, entry] of entries) {
            if (entry.createdAt < cutoff) entries.delete(state);
        }
    }

    return {
        put(state, entry) {
            sweep();
            entries.set(state, {...entry, createdAt: Date.now()});
        },
        take(state) {
            const entry = entries.get(state);
            entries.delete(state);
            if (entry === undefined) return undefined;
            if (entry.createdAt < Date.now() - STATE_TTL_MS) return undefined;
            return entry;
        },
    };
}
