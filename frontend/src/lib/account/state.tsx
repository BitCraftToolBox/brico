/**
 * state.tsx — the `brico-app`-specific consumer of the generic connection layer, for accounts.
 *
 * Mounted once, above the routes (`app.tsx`), so a login persists across navigation and the
 * sidebar can show account state without every page re-deriving it — see `ConnectionManagerProvider`
 * for why the same pattern is used there.
 *
 * The `brico-app` connection is never dialed just because the app loaded: `useConnection` below
 * only registers a manager reference (see its doc comment — dialing happens inside
 * `requestResource`), and this file only calls that once it already has an unexpired OIDC session
 * to prime the connection's token with. A logged-out visitor never opens a socket to `brico-app`.
 */
import {tables} from "@brico/bindings/brico-app";
import type {Account} from "@brico/bindings/brico-app/types";
import {createContext, createMemo, createSignal, type JSX, onCleanup, onMount, useContext} from "solid-js";
import {isServer} from "solid-js/web";
import * as oidc from "~/lib/account/oidc";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface AccountContextValue {
    /**
     * True once an OIDC session has produced a connected `brico-app` account row.
     */
    isLoggedIn: () => boolean;
    /**
     * The caller's own account row, once loaded. `null` while logged out or still syncing.
     */
    account: () => Account | null;
    /**
     * The current SpacetimeAuth login's `login_method` claim (`"discord"`, `"github"`, ...),
     * or `null` while logged out. Read by `lib/account/links.tsx` to decide whether the
     * zero-round-trip Discord linking shortcut (`linkDiscordViaSpacetimeAuth`) applies.
     */
    loginMethod: () => string | null;
    /** Starts the SpacetimeAuth login flow. Navigates away. */
    login: () => Promise<void>;
    /** Ends the local session and drops the `brico-app` connection's resource claim. */
    logout: () => Promise<void>;
    /** Renames the caller's own account. `null`/empty clears the display name. No-op while logged out. */
    setDisplayName: (name: string | null) => Promise<void>;
    /**
     * Re-checks for an OIDC session and, if one exists, (re)subscribes. Idempotent — safe to call
     * even if already subscribed. `/account/callback` calls this right after completing the OIDC
     * exchange, so the freshly-stored session is picked up in-place; the alternative (a full page
     * reload) would also re-run every other data fetch the app does on load, which is unnecessary
     * churn for what is otherwise a plain client-side navigation back to `/account`.
     */
    refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>();

export function AccountProvider(props: {children: JSX.Element}) {
    const conn = useConnection(BRICO_APP_SERVER);

    const [account, setAccount] = createSignal<Account | null>(null);
    const [loginMethod, setLoginMethod] = createSignal<string | null>(null);
    let release: (() => void) | null = null;
    /** Guards against re-calling `ensure_account` while the insert it triggered is still in flight. */
    let ensuring = false;

    function readAccount() {
        const active = conn.active();
        if (!active) {
            setAccount(null);
            return;
        }
        const row = ([...active.db.myAccount.iter()][0] as Account | undefined) ?? null;
        setAccount(row);
        if (row === null) {
            if (!ensuring) {
                ensuring = true;
                active.reducers.ensureAccount({});
            }
        } else {
            ensuring = false;
        }
    }

    function subscribe() {
        if (release) return;
        const request = conn.requestResource(
            {key: "account:self", tables: [bricoAppTable(tables.myAccount)]},
            readAccount,
        );
        release = request.release;
    }

    function unsubscribe() {
        release?.();
        release = null;
        ensuring = false;
        setAccount(null);
    }

    async function refresh() {
        if (isServer) return;
        // `getCurrentUser()` alone comes back empty for a tab reloaded after the ~15 minute
        // id_token already expired.
        // try to silently renew those here, though that's subject to SpacetimeAuth working
        // (see `renewSilently` comment).
        const user = (await oidc.getCurrentUser()) ?? (await oidc.renewSilently());
        if (user?.id_token) {
            conn.primeToken(user.id_token);
            const method = user.profile?.login_method;
            setLoginMethod(typeof method === "string" ? method : null);
            subscribe();
        } else {
            setLoginMethod(null);
        }
    }

    onMount(() => {
        void refresh();
        // Keeps the connection's stored credential current as `automaticSilentRenew` refreshes it
        // in the background — `connection.ts`'s own reconnect-after-drop reads localStorage
        // synchronously with no way to await a refresh, so the token needs to already be fresh by
        // the time a drop happens.
        onCleanup(oidc.onTokenRenewed(user => {
            if (user.id_token) conn.primeToken(user.id_token);
        }));
        // A silent renewal that fails in the background means the refresh token itself is dead, not
        // just the short-lived access token — unrecoverable without an interactive login, so treat
        // it as a real logout rather than let `connection.ts` redial a permanently-expired
        // credential every `reconnectDelayMs` forever.
        onCleanup(oidc.onSilentRenewError(() => void logout()));
    });

    async function logout() {
        unsubscribe();
        // `unsubscribe`'s resource release alone won't bring the connection's ref count to zero —
        // this provider's own `useConnection` above holds a base claim for its entire (app-lifetime)
        // mount, so the manager would never see a reason to close the socket on its own. Closing it
        // directly is what makes a logged-out visitor actually have no open `brico-app` socket,
        // matching this file's own doc comment.
        conn.close();
        conn.clearToken();
        setLoginMethod(null);
        await oidc.clearLocalSession();
    }

    function setDisplayName(name: string | null) {
        const active = conn.active();
        if (!active) return Promise.reject(new Error("Not connected"));
        const trimmed = name?.trim();
        return active.reducers.setDisplayName({displayName: trimmed ? trimmed : undefined});
    }

    // `createMemo`, not `() => account() !== null` — see the interface's doc comment. This is
    // what makes `isLoggedIn()` a *stable* boolean: a consumer's `createEffect` that depends on
    // it only re-runs when the login state actually flips, not on every row write (e.g. another
    // live session on the same account bumping `lastSeenAt`).
    const isLoggedIn = createMemo(() => account() !== null);

    const value: AccountContextValue = {
        isLoggedIn,
        account,
        loginMethod,
        login: oidc.login,
        logout,
        setDisplayName,
        refresh,
    };

    return <AccountContext.Provider value={value}>{props.children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
    const value = useContext(AccountContext);
    if (!value) throw new Error("useAccount: no AccountProvider above this component.");
    return value;
}
