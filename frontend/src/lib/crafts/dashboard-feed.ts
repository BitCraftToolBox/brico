/**
 * dashboard-feed.ts — polls the module's `GET /dashboard` route with the owner's `publicDashboard` API key.
 */
import {type Accessor, createEffect, createSignal, onCleanup} from "solid-js";
import {type Dashboard, parseDashboard} from "~/lib/crafts/dashboard";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";

/** How often the feed is re-read; private bounties and payees are not pushed. */
export const DASHBOARD_POLL_MS = 60_000;

export type DashboardErrorKind = "invalid_key" | "unavailable";

/** The module's HTTP route for the feed, derived from the same host/module the app connects to. */
function dashboardEndpoint(): string {
    const base = BRICO_APP_SERVER.uri.replace(/^ws/, "http").replace(/\/+$/, "");
    return `${base}/v1/database/${encodeURIComponent(BRICO_APP_SERVER.module)}/route/dashboard`;
}

class DashboardError extends Error {
    constructor(readonly kind: DashboardErrorKind) {
        super(kind);
    }
}

async function fetchDashboard(key: string, signal: AbortSignal): Promise<Dashboard> {
    let response: Response;
    try {
        response = await fetch(dashboardEndpoint(), {headers: {authorization: `Bearer ${key}`}, cache: "no-store", signal});
    } catch (cause) {
        if (signal.aborted) throw cause;
        throw new DashboardError("unavailable");
    }
    if (response.status === 401 || response.status === 403) throw new DashboardError("invalid_key");
    if (!response.ok) throw new DashboardError("unavailable");
    try {
        return parseDashboard(await response.json());
    } catch {
        throw new DashboardError("unavailable");
    }
}

export interface DashboardFeed {
    /** The latest successful read; kept on screen while a later read fails. */
    data: Accessor<Dashboard | null>;
    /** Why the latest read failed; null after a success. */
    error: Accessor<DashboardErrorKind | null>;
}

/**
 * Reads the feed with `key` now and every `DASHBOARD_POLL_MS` while the calling component lives,
 * restarting if the key changes. Client only: effects don't run during SSR.
 */
export function createDashboardFeed(key: Accessor<string | null>): DashboardFeed {
    const [data, setData] = createSignal<Dashboard | null>(null);
    const [error, setError] = createSignal<DashboardErrorKind | null>(null);

    createEffect(() => {
        const token = key();
        if (token === null) return;
        let controller = new AbortController();

        const load = async () => {
            controller.abort();
            controller = new AbortController();
            const {signal} = controller;
            try {
                const next = await fetchDashboard(token, signal);
                if (signal.aborted) return;
                setData(next);
                setError(null);
            } catch (cause) {
                if (signal.aborted) return;
                setError(cause instanceof DashboardError ? cause.kind : "unavailable");
            }
        };
        void load();
        const timer = setInterval(() => void load(), DASHBOARD_POLL_MS);
        onCleanup(() => {
            clearInterval(timer);
            controller.abort();
        });
    });

    return {data, error};
}
