/**
 * oidc.ts — SpacetimeAuth as an OIDC identity provider for the browser.
 *
 * `oidc-client-ts` is the library `react-oidc-context` wraps for React; it's framework-agnostic
 * (a plain `UserManager` class), so it works directly in Solid without a dedicated wrapper.
 *
 * This is deliberately just the OIDC dance — obtaining/refreshing/forgetting a `User` (which
 * carries the `id_token` SpacetimeDB derives an `Identity` from). Turning that into a live
 * `brico-app` connection and a brico `account` row is `lib/account/state.tsx`'s job.
 *
 * `UserManager` touches `window`/`localStorage` in its constructor, so — mirroring the SSR
 * discipline in `lib/spacetime/connection.ts` — it is never constructed at module scope, only
 * lazily on first use from a browser-only call site (a click handler or an `onMount`).
 */
import {type User, UserManager} from "oidc-client-ts";

/** SpacetimeDB's own beta OIDC provider. Not configurable — there is only one. */
const AUTHORITY = "https://auth.spacetimedb.com/oidc";

const CLIENT_ID = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID as string ?? "client_034GOTUp60ggtFOXkImWEk";

/** `openid` for the `sub` claim SpacetimeDB keys `Identity` on, `profile` for a display name. No `email` — no PII needed. */
const SCOPE = "openid profile offline_access";

let manager: UserManager | undefined;

function getManager(): UserManager {
    if (!manager) {
        manager = new UserManager({
            authority: AUTHORITY,
            client_id: CLIENT_ID,
            redirect_uri: `${window.location.origin}/account/callback`,
            response_type: "code",
            scope: SCOPE,
            // SpacetimeAuth's id_token is short-lived (~15 minutes). `automaticSilentRenew` keeps
            // a tab that's open past those 15 minutes fresh in the background, proactively.
            // The reactive case (cold-start) would be handled by `renewSilently` below.
            automaticSilentRenew: true,
        });
    }
    return manager;
}

/** Starts the login flow. Navigates away — nothing after this call runs. */
export function login(): Promise<void> {
    return getManager().signinRedirect();
}

/** Completes the login flow on `/account/callback`. Throws on a rejected/invalid response. */
export function handleCallback(): Promise<User> {
    return getManager().signinCallback() as Promise<User>;
}

/** The current session, or `null` if there isn't one or it has expired. */
export async function getCurrentUser(): Promise<User | null> {
    const user = await getManager().getUser();
    return user && !user.expired ? user : null;
}

/**
 * Refreshes the session via refresh token against SpacetimeAuth (no redirect, no popup).
 * The cold-start counterpart to `automaticSilentRenew` above. This is currently non-functional
 * since SpacetimeAuth's inbuilt `offline_access` scope does not actually work for offline
 * access (go figure). If they fix it on their end, this should just work™.
 */
export async function renewSilently(): Promise<User | null> {
    try {
        const user = await getManager().signinSilent();
        return user && !user.expired ? user : null;
    } catch {
        return null;
    }
}

/**
 * Fires whenever the session is (re)established, including a background `automaticSilentRenew`
 * cycle — so a caller holding a `SpacetimeConnection` can re-prime it with the new token. That
 * matters specifically because `connection.ts`'s own reconnect-after-drop reads its stored
 * credential from localStorage synchronously with no way to await a refresh, so the token sitting
 * there needs to already be current by the time a drop happens, not fetched reactively after.
 * Returns an unsubscribe function.
 */
export function onTokenRenewed(callback: (user: User) => void): () => void {
    return getManager().events.addUserLoaded(callback);
}

/**
 * Fires when a background silent renewal definitively fails — the refresh token itself is
 * expired/revoked, not just the short-lived access token, which is unrecoverable without an
 * interactive login. A caller should treat this as a real logout rather than leave
 * `connection.ts` redialing a permanently-expired credential every `reconnectDelayMs` forever.
 * Returns an unsubscribe function.
 */
export function onSilentRenewError(callback: (error: Error) => void): () => void {
    return getManager().events.addSilentRenewError(callback);
}

/** Forgets the local session. No SpacetimeAuth-side (RP-initiated) logout — see the plan's note. */
export function clearLocalSession(): Promise<void> {
    return getManager().removeUser();
}
