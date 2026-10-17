/**
 * links.tsx — the `brico-app`-specific consumer of the generic connection layer, for linked
 * integrations (BitCraft via BitAuth, Discord, Stelo wallets). Same relationship to `lib/spacetime/brico-app.ts`
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
 *  **Stelo wallets**: `beginLink("stelo")` then `submitSteloCandidate(code, address)`; `brico-bot`
 *    verifies the address and finalizes. `steloWallets()` joins each active `stelo` link to its
 *    registered wallet row and the bot's `canPull` mirror.
 *
 * `linkDiscordShortcut` skips the ticket dance entirely for a connection whose own SpacetimeAuth
 * login was via Discord (`linkDiscordViaSpacetimeAuth`, gated module-side on that same claim).
 */
import {tables} from "@brico/bindings/brico-app";
import type {
    IntegrationLinkRequest,
    LinkedIntegration,
    SteloReceivingWallet,
    SteloWallet,
    SteloWalletStatus,
} from "@brico/bindings/brico-app/types";
import {createContext, createEffect, createMemo, createSignal, type JSX, untrack, useContext} from "solid-js";
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

/** One of the caller's active Stelo wallet links, joined to its registered wallet row. */
export interface SteloWalletView {
    link: LinkedIntegration;
    currency: string;
    /** The wallet's `#ADDRESS` as recorded at link time (without the `#`). */
    address: string;
    /** This wallet receives payouts and refunds in its currency. */
    isReceiving: boolean;
    /** Whether `brico-bot` can pull from it; `undefined` until the bot has checked. */
    canPull: boolean | undefined;
    /** Whether the bot verified that the linker administers the wallet; `undefined` until it has checked. Only a verified wallet can fund bounties. */
    verified: boolean | undefined;
}

export interface LinkedIntegrationsContextValue {
    /** The caller's own integration links, active ones only — revoked rows are kept module-side
     * for history, but nothing here needs to show them. */
    links: () => LinkedIntegration[];
    /** Pending out-of-band requests for this account, not yet finalized (e.g. "waiting on BitAuth"). */
    pendingRequests: () => IntegrationLinkRequest[];
    /** The caller's registered Stelo wallets; an active `stelo` link whose wallet row hasn't been written yet is left out. */
    steloWallets: () => SteloWalletView[];
    /** `steloWallets()` on one currency's ledger. */
    steloWalletsFor: (currency: string) => SteloWalletView[];
    /** The `stelo` links the bot has not registered as wallets yet. */
    unregisteredSteloLinks: () => LinkedIntegration[];
    /** True once the first read of the link and wallet tables has applied. */
    walletsReady: () => boolean;
    /** Starts a browser-initiated link and returns the correlation code to redirect `brico-bot`
     * with. Rejects if not connected. */
    beginLink: (provider: string) => Promise<string>;
    /** Finishes a bot-initiated link (Discord `/link`) once logged in. */
    claimLink: (code: string) => Promise<void>;
    /** One-click Discord link off the current login's own Discord claims — only succeeds if
     * `useAccount().loginMethod() === "discord"`. */
    linkDiscordShortcut: () => Promise<void>;
    unlink: (id: bigint) => Promise<void>;
    /**
     * Names the Stelo account address (`#ABCDEF`, with or without the `#`) a pending `stelo` link request
     * should verify. `unverified` lets the bot link an account it cannot verify ownership of, after
     * `confirmLinkCandidate`; such a wallet can only receive payouts.
     */
    submitSteloCandidate: (code: string, address: string, unverified: boolean) => Promise<void>;
    /** Accepts the account the bot matched for an unverified request (`pendingReason` `confirm-unverified`). */
    confirmLinkCandidate: (code: string) => Promise<void>;
    /** Abandons the caller's own unresolved link request. */
    cancelLinkRequest: (code: string) => Promise<void>;
    /** Makes one of the caller's wallets receive payouts and refunds in `currency`. */
    setReceivingWallet: (currency: string, linkId: bigint) => Promise<void>;
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

function sameRows<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): boolean {
    return a.length === b.length && a.every((row, i) => same(row, b[i]));
}

const sameWallets = (a: SteloWallet[], b: SteloWallet[]) =>
    sameRows(a, b, (x, y) => x.linkId === y.linkId && x.currency === y.currency);
const sameReceiving = (a: SteloReceivingWallet[], b: SteloReceivingWallet[]) =>
    sameRows(a, b, (x, y) => x.linkId === y.linkId && x.currency === y.currency);
const sameStatuses = (a: SteloWalletStatus[], b: SteloWalletStatus[]) =>
    sameRows(a, b, (x, y) => x.linkId === y.linkId && x.canPull === y.canPull && x.verified === y.verified);

const LinkedIntegrationsContext = createContext<LinkedIntegrationsContextValue>();

export function LinkedIntegrationsProvider(props: {children: JSX.Element}) {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);

    const [links, setLinks] = createSignal<LinkedIntegration[]>([], {equals: sameLinkedIntegrations});
    const [pendingRequests, setPendingRequests] = createSignal<IntegrationLinkRequest[]>([]);
    const [wallets, setWallets] = createSignal<SteloWallet[]>([], {equals: sameWallets});
    const [receiving, setReceiving] = createSignal<SteloReceivingWallet[]>([], {equals: sameReceiving});
    const [statuses, setStatuses] = createSignal<SteloWalletStatus[]>([], {equals: sameStatuses});
    const [walletsReady, setWalletsReady] = createSignal(false);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setLinks([]);
            setPendingRequests([]);
            setWallets([]);
            setReceiving([]);
            setStatuses([]);
            setWalletsReady(false);
            return;
        }
        setLinks(active.db.myLinkedIntegration.iter().filter(l => l.revokedAt === undefined).toArray() as LinkedIntegration[]);
        setPendingRequests([...active.db.myIntegrationLinkRequest.iter()] as IntegrationLinkRequest[]);
        setWallets([...active.db.mySteloWallet.iter()] as SteloWallet[]);
        setReceiving([...active.db.mySteloReceivingWallet.iter()] as SteloReceivingWallet[]);
        setStatuses([...active.db.mySteloWalletStatus.iter()] as SteloWalletStatus[]);
        setWalletsReady(true);
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
                    tables: [
                        bricoAppTable(tables.myLinkedIntegration),
                        bricoAppTable(tables.myIntegrationLinkRequest),
                        bricoAppTable(tables.mySteloWallet),
                        bricoAppTable(tables.mySteloReceivingWallet),
                        bricoAppTable(tables.mySteloWalletStatus),
                    ],
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
        setWallets([]);
        setReceiving([]);
        setStatuses([]);
        setWalletsReady(false);
    }

    const steloWallets = createMemo((): SteloWalletView[] => {
        const registered = new Map(wallets().map(wallet => [wallet.linkId, wallet]));
        const receivingLinks = new Set(receiving().map(row => row.linkId));
        const status = new Map(statuses().map(row => [row.linkId, row]));
        const views: SteloWalletView[] = [];
        for (const link of links()) {
            const wallet = link.provider === "stelo" ? registered.get(link.id) : undefined;
            if (!wallet) continue;
            views.push({
                link,
                currency: wallet.currency,
                address: link.externalHandle ?? link.externalId,
                isReceiving: receivingLinks.has(link.id),
                canPull: status.get(link.id)?.canPull,
                verified: status.get(link.id)?.verified,
            });
        }
        return views;
    });
    const unregisteredSteloLinks = createMemo(() => {
        const registered = new Set(wallets().map(wallet => wallet.linkId));
        return links().filter(link => link.provider === "stelo" && !registered.has(link.id));
    });

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

    async function submitSteloCandidate(code: string, address: string, unverified: boolean): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.submitIntegrationLinkCandidate({code, candidate: address, unverified});
    }

    async function confirmLinkCandidate(code: string): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.confirmIntegrationLinkCandidate({code});
    }

    async function cancelLinkRequest(code: string): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.cancelIntegrationLinkRequest({code});
    }

    async function setReceivingWallet(currency: string, linkId: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected");
        await active.reducers.setSteloReceivingWallet({currency, linkId});
    }

    const value: LinkedIntegrationsContextValue = {
        links,
        pendingRequests,
        steloWallets,
        steloWalletsFor: currency => steloWallets().filter(wallet => wallet.currency === currency),
        unregisteredSteloLinks,
        walletsReady,
        submitSteloCandidate,
        confirmLinkCandidate,
        cancelLinkRequest,
        setReceivingWallet,
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
