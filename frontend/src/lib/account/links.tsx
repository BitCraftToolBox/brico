/**
 * links.tsx — the `brico-app`-specific consumer of the generic connection layer, for linked
 * integrations (BitCraft via BitAuth, Discord). Same relationship to `lib/spacetime/brico-app.ts`
 * that `lib/account/state.tsx` and `lib/notifications/state.tsx` have; mounted as a child of
 * `AccountProvider` (needs `useAccount()`) — see `app.tsx`.
 *
 *  **Browser-initiated** (BitAuth, Discord's OAuth handshake): `beginLink(provider)` opens a
 *    pending request with this side (`accountIdentity`) already filled in and returns its
 *    correlation code; the caller then does a real page navigation
 *    (`window.location.href = bitAuthLoginUrl(code)`/`discordLoginUrl(code)`, from
 *    `lib/account/brico-bot.ts`) to `brico-bot`, which finalizes server-side and redirects back to
 *    `/account?linked=<provider>` or `?linkError=...`.
 *
 * `linkDiscordShortcut` skips the ticket dance entirely for a connection whose own SpacetimeAuth
 * login was via Discord (`linkDiscordViaSpacetimeAuth`, gated module-side on that same claim).
 */
import {tables} from "@brico/bindings/brico-app";
import type {IntegrationLinkRequest, LinkedIntegration} from "@brico/bindings/brico-app/types";
import {createContext, createEffect, createSignal, type JSX, untrack, useContext} from "solid-js";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/**
 * Survives the SpacetimeAuth login redirect round trip for the bot-initiated Discord flow — a
 * login started from `/account/link?code=...` navigates away and back via `/account/callback`,
 * losing the query string. `callback.tsx` checks this key and routes back to `/account/link`
 * with the code restored instead of the usual plain `/account`.
 */
export const PENDING_LINK_CODE_KEY = "brico:pendingLinkCode";

export interface LinkedIntegrationsContextValue {
    /** The caller's own integration links, active ones only — revoked rows are kept module-side
     * for history, but nothing here needs to show them. */
    links: () => LinkedIntegration[];
    /** Pending out-of-band requests for this account, not yet finalized (e.g. "waiting on BitAuth"). */
    pendingRequests: () => IntegrationLinkRequest[];
    /** Starts a browser-initiated link and returns the correlation code to redirect `brico-bot`
     * with. Rejects if not connected. */
    beginLink: (provider: string) => Promise<string>;
    /** Finishes a bot-initiated link (Discord `/link`) once logged in. */
    claimLink: (code: string) => Promise<void>;
    /** One-click Discord link off the current login's own Discord claims — only succeeds if
     * `useAccount().loginMethod() === "discord"`. */
    linkDiscordShortcut: () => Promise<void>;
    unlink: (id: bigint) => Promise<void>;
}

/**
 * Row-identity comparison for `links`' `equals` — `readRows` rebuilds this array from scratch on
 * every subscribed-table change (including ones to `myIntegrationLinkRequest`, which has nothing
 * to do with this list), so without a custom `equals` the signal's default reference check would
 * notify every reader on every such change even when the active link set didn't actually move.
 * `revokedAt` isn't compared: `readRows` has already filtered to `revokedAt === undefined` rows,
 * so it's always `undefined` here.
 */
function sameLinkedIntegrations(a: LinkedIntegration[], b: LinkedIntegration[]): boolean {
    return a.length === b.length && a.every((row, i) => {
        const other = b[i];
        return row.id === other.id
            && row.accountIdentity.isEqual(other.accountIdentity)
            && row.provider === other.provider
            && row.externalId === other.externalId
            && row.externalHandle === other.externalHandle
            && row.linkedAt.microsSinceUnixEpoch === other.linkedAt.microsSinceUnixEpoch;
    });
}

const LinkedIntegrationsContext = createContext<LinkedIntegrationsContextValue>();

export function LinkedIntegrationsProvider(props: {children: JSX.Element}) {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const [links, setLinks] = createSignal<LinkedIntegration[]>([], {equals: sameLinkedIntegrations});
    const [pendingRequests, setPendingRequests] = createSignal<IntegrationLinkRequest[]>([]);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setLinks([]);
            setPendingRequests([]);
            return;
        }
        setLinks(([...active.db.myLinkedIntegration.iter()] as LinkedIntegration[]).filter(l => l.revokedAt === undefined));
        setPendingRequests([...active.db.myIntegrationLinkRequest.iter()] as IntegrationLinkRequest[]);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing — see `notifications/state.tsx`'s `subscribe()` doc comment
        // for the exact re-subscribe race this avoids.
        const request = untrack(() =>
            conn.requestResource(
                {
                    key: "links:self",
                    tables: [bricoAppTable(tables.myLinkedIntegration), bricoAppTable(tables.myIntegrationLinkRequest)],
                },
                readRows,
            )
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setLinks([]);
        setPendingRequests([]);
    }

    // `acc.isLoggedIn()` is a `createMemo` at the source, so this only re-runs on the actual
    // boolean flip — see `account/state.tsx`'s doc comment on `account`.
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    async function beginLink(provider: string): Promise<string> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        const code = crypto.randomUUID();
        await active.reducers.beginIntegrationLink({code, provider});
        return code;
    }

    async function claimLink(code: string): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.claimIntegrationLink({code});
    }

    async function linkDiscordShortcut(): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.linkDiscordViaSpacetimeAuth({});
    }

    async function unlink(id: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.unlinkIntegration({id});
    }

    const value: LinkedIntegrationsContextValue = {
        links,
        pendingRequests,
        beginLink,
        claimLink,
        linkDiscordShortcut,
        unlink,
    };

    return <LinkedIntegrationsContext.Provider value={value}>{props.children}</LinkedIntegrationsContext.Provider>;
}

export function useLinkedIntegrations(): LinkedIntegrationsContextValue {
    const value = useContext(LinkedIntegrationsContext);
    if (!value) throw new Error("useLinkedIntegrations: no LinkedIntegrationsProvider above this component.");
    return value;
}
