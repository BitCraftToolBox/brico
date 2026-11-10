/**
 * dashboard-live.ts — the dashboard feed as a live subscription to the module's `dashboard_*` views,
 * addressed by the owner's `publicDashboard` API key.
 */
import {throttle} from "@solid-primitives/scheduled";
import {type Accessor, createEffect, createMemo, createSignal, onCleanup, untrack} from "solid-js";
import type {Dashboard} from "~/lib/crafts/dashboard";
import type {DashboardFeed} from "~/lib/crafts/dashboard-feed";
import {BRICO_APP_SERVER} from "~/lib/spacetime/brico-app";
import {type ResourceRequest, useConnection} from "~/lib/spacetime/manager";

const REBUILD_INTERVAL_MS = 100;

/** Keys are interpolated into the subscription SQL, so only a conservative alphabet is accepted. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Subscribes to `dashboard_key/payee/bounty(key)` while the calling component lives, restarting if
 * the key changes. `data` is null until the first apply and keeps the last value across a
 * disconnect; `error` is `invalid_key` once the subscription applied with no live key behind it, and
 * `unavailable` while the connection is down. Client only: effects don't run during SSR.
 */
export function createLiveDashboardFeed(key: Accessor<string | null>): DashboardFeed {
    const connection = useConnection(BRICO_APP_SERVER);
    const [data, setData] = createSignal<Dashboard | null>(null);
    const [keyValid, setKeyValid] = createSignal<boolean | null>(null);

    // A string memo: the effect below re-runs only when the key itself changes.
    const token = createMemo(key);
    let rebuild = () => {};
    const scheduleRebuild = throttle(() => rebuild(), REBUILD_INTERVAL_MS);
    onCleanup(() => scheduleRebuild.clear());

    // The previous key's request is dropped before the next one subscribes, so stale dashboard rows
    // can never mix into the new key's cache. Unmount still uses the grace-period release below.
    let previous: ResourceRequest | null = null;

    createEffect(() => {
        const current = token();
        previous?.dispose();
        previous = null;
        untrack(() => {
            setData(null);
            setKeyValid(null);
        });
        if (current === null) return;
        if (!KEY_PATTERN.test(current)) {
            setKeyValid(false);
            return;
        }
        untrack(() => {
            const request = connection.requestResource(
                {
                    key: `dashboard:${current}`,
                    tables: ["dashboard_key", "dashboard_payee", "dashboard_bounty"].map(table => ({table, query: `SELECT * FROM ${table}('${current}')`})),
                },
                scheduleRebuild,
            );
            previous = request;
            rebuild = () => {
                const active = connection.active();
                if (!active) return;
                const keyRow = active.db.dashboardKey.iter().next().value;
                setKeyValid(keyRow !== undefined);
                setData(keyRow ? {
                    name: keyRow.name,
                    payees: active.db.dashboardPayee.iter().map(row => ({
                        payeePlayerId: String(row.payeePlayerId),
                        payeeName: row.payeeName ?? null,
                        currency: row.currency,
                        effortTotal: row.effortTotal,
                        earnedTotal: row.earnedTotal,
                        paidTotal: row.paidTotal,
                    })).toArray(),
                    bounties: active.db.dashboardBounty.iter().map(row => ({
                        craftId: String(row.craftId),
                        ratioNumerator: row.ratioNumerator,
                        ratioDenominator: row.ratioDenominator,
                        currency: row.currency,
                        private: row.private,
                    })).toArray(),
                } : null);
            };
            // The rows are in the cache the moment the request is ready; don't wait for the throttle.
            createEffect(() => {
                if (request.ready()) rebuild();
            });
            onCleanup(() => {
                request.release();
                scheduleRebuild.clear();
            });
        });
    });

    const error = () => keyValid() === false ? "invalid_key" as const : connection.error() ? "unavailable" as const : null;
    return {data, error};
}
