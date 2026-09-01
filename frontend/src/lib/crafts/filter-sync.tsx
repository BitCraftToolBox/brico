/**
 * filter-sync.tsx — syncs saved craft filters/watches between localStorage and `brico-app`.
 *
 * The actual merge decision (push / pull / no-op / conflict-toast) is `filter-sync-merge.ts`'s
 * `reconcile()`, a pure function shared identically by filters and watches — see its doc comment
 * for the algorithm itself. This file is just the Solid/SpacetimeDB wiring around it: reading
 * `savedCraftFilters()` and the
 * live `mySavedCraftFilter` view into the shapes `reconcile()` wants, persisting its own
 * `syncMeta` shadow maps (one per entity, in their own localStorage keys — this state belongs to
 * the sync layer, not to `settings.tsx`), and turning its `pushes`/`conflicts` output into reducer
 * calls and toasts.
 *
 * Filters are always reconciled before watches within one pass: a watch's `upsertCraftFilterWatch`
 * reducer requires its `saved_craft_filter` to already exist server-side, so a brand-new
 * filter+watch pair created together must reach the server in that order. Calls on the same
 * connection are processed in the order they're sent, so doing the filter push first here is
 * enough — no need to wait for its round trip before sending the watch push.
 */
import {tables} from "@brico/bindings/brico-app";
import type {CraftFilterWatch, SavedCraftFilter as RemoteSavedCraftFilter} from "@brico/bindings/brico-app/types";
import {type FilterNode, parseFilter} from "@brico/crafts/filter";
import {createContext, createEffect, createSignal, type JSX, untrack, useContext} from "solid-js";
import {isServer} from "solid-js/web";
import {Timestamp} from "spacetimedb";
import {showToast} from "~/components/ui/toast";
import {useAccount} from "~/lib/account/state";
import {describeServerError} from "~/lib/crafts/error-vocab";
import {reconcile, type RemoteEntityRow, type SyncMetaMap} from "~/lib/crafts/filter-sync-merge";
import {type CraftWatchTriggers, type SavedCraftFilter, useSettings} from "~/lib/settings";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

const FILTER_SYNC_META_KEY = "brico:crafts:filter-sync-meta";
const WATCH_SYNC_META_KEY = "brico:crafts:watch-sync-meta";

type FilterContent = {name: string; filter: FilterNode};

function loadSyncMeta(key: string): SyncMetaMap {
    if (isServer) return {};
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as SyncMetaMap) : {};
    } catch {
        return {};
    }
}

function saveSyncMeta(key: string, meta: SyncMetaMap) {
    if (isServer) return;
    try {
        localStorage.setItem(key, JSON.stringify(meta));
    } catch {
        // storage unavailable — the in-memory copy still drives this session correctly
    }
}

function remoteFiltersFrom(rows: Iterable<RemoteSavedCraftFilter>): Record<string, RemoteEntityRow<FilterContent>> {
    const out: Record<string, RemoteEntityRow<FilterContent>> = {};
    for (const row of rows) {
        // Same "structurally invalid entries dropped" convention as settings.tsx's own
        // `savedCraftFilters` memo — a corrupted or newer-field-set `filterJson` must not break
        // sync for every other filter.
        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(row.filterJson);
        } catch {
            continue;
        }
        const filter = parseFilter(parsedJson);
        if (!filter) continue;
        out[row.id] = {
            content: {name: row.name, filter},
            updatedAtMs: Number(row.updatedAt.toMillis()),
            deletedAtMs: row.deletedAt !== undefined ? Number(row.deletedAt.toMillis()) : null,
        };
    }
    return out;
}

function remoteWatchesFrom(rows: Iterable<CraftFilterWatch>): Record<string, RemoteEntityRow<CraftWatchTriggers>> {
    const out: Record<string, RemoteEntityRow<CraftWatchTriggers>> = {};
    for (const row of rows) {
        out[row.filterId] = {
            content: {added: row.added, finished: row.finished, removed: row.removed},
            updatedAtMs: Number(row.updatedAt.toMillis()),
            deletedAtMs: row.deletedAt !== undefined ? Number(row.deletedAt.toMillis()) : null,
        };
    }
    return out;
}

export interface FilterSyncContextValue {
    /** Message from the most recent failed push, if any — for a future settings/debug surface. */
    lastError: () => string | null;
}

const FilterSyncContext = createContext<FilterSyncContextValue>();

export function FilterSyncProvider(props: {children: JSX.Element}) {
    const acc = useAccount();
    const {savedCraftFilters, setSavedCraftFilters, craftFilterWatches, setCraftFilterWatches} = useSettings();
    const conn = useConnection(BRICO_APP_SERVER);

    const [lastError, setLastError] = createSignal<string | null>(null);

    // Tracks whether the "filters:self" resource's own subscription has applied — NOT the same
    // as the connection being active. `conn` is shared with `AccountProvider` (same (uri,module)
    // key), so `conn.active()` flips true as soon as *that* provider's own "account:self"
    // subscription opens the socket — well before this provider's `subscribe()` below even runs
    // (which itself waits on `acc.isLoggedIn()`, one more round trip behind). Gating on a real
    // Solid signal here (rather than reading `conn.active()` alone) matters for more than just
    // `runReconcile`'s own early return: the local-settings effect below calls `runReconcile()`
    // inside a tracked scope, so whatever signals `runReconcile` reads become that effect's
    // dependencies too — reading this signal is what makes that effect automatically re-run once
    // the resource actually becomes ready, instead of only ever seeing an empty remote set.
    const [resourceReady, setResourceReady] = createSignal(false);

    // Loaded lazily (not at module scope) so this never touches localStorage during SSR.
    let filterSyncMeta: SyncMetaMap | null = null;
    let watchSyncMeta: SyncMetaMap | null = null;
    function ensureMetaLoaded() {
        if (filterSyncMeta === null) filterSyncMeta = loadSyncMeta(FILTER_SYNC_META_KEY);
        if (watchSyncMeta === null) watchSyncMeta = loadSyncMeta(WATCH_SYNC_META_KEY);
    }

    function reportConflict(filterId: string, fallbackName: string) {
        const name = savedCraftFilters().find(f => f.id === filterId)?.name ?? fallbackName;
        showToast({
            title: () => "Filter updated elsewhere",
            description: () => `An offline change to "${name}" was overwritten by a newer version from another device.`,
        });
    }

    function runReconcile() {
        if (isServer) return;
        const active = conn.active();
        // `resourceReady()` must be read even though `active` alone looks sufficient — see the
        // signal's doc comment above; this is what stops a reconcile pass from running against
        // `mySavedCraftFilter`/`myCraftFilterWatch` before they've actually been subscribed.
        if (!active || !resourceReady()) return;
        ensureMetaLoaded();
        const nowMs = Date.now();

        // --- Filters ---
        const localFilters: Record<string, FilterContent> = {};
        for (const saved of savedCraftFilters()) localFilters[saved.id] = {name: saved.name, filter: saved.filter};

        const filterResult = reconcile({
            localContent: localFilters,
            syncMeta: filterSyncMeta!,
            remote: remoteFiltersFrom(active.db.mySavedCraftFilter.iter()),
            nowMs,
        });
        filterSyncMeta = filterResult.syncMeta;
        saveSyncMeta(FILTER_SYNC_META_KEY, filterSyncMeta);

        if (Object.keys(filterResult.localUpserts).length > 0 || filterResult.localRemovals.length > 0) {
            const removed = new Set(filterResult.localRemovals);
            const upserted = filterResult.localUpserts;
            const next: SavedCraftFilter[] = [
                ...savedCraftFilters().filter(f => !removed.has(f.id) && !(f.id in upserted)),
                ...Object.entries(upserted).map(([id, content]) => ({id, name: content.name, filter: content.filter})),
            ];
            setSavedCraftFilters(next);
        }

        for (const push of filterResult.pushes) {
            const updatedAt = Timestamp.fromDate(new Date(push.updatedAtMs));
            const call = push.upsert
                ? active.reducers.upsertSavedCraftFilter({
                    id: push.id,
                    name: push.upsert.name,
                    filterJson: JSON.stringify(push.upsert.filter),
                    updatedAt,
                })
                : active.reducers.deleteSavedCraftFilter({id: push.id, deletedAt: updatedAt});
            // A rejected push (offline, or a stale write the server's LWW guard dropped) is not
            // fatal — the next reconcile pass (next remote change, or the next local edit) simply
            // tries again from the current state.
            call.catch(err => setLastError(describeServerError(err)));
        }

        for (const id of filterResult.conflicts) {
            reportConflict(id, filterResult.localUpserts[id]?.name ?? id);
        }

        // --- Watches --- (after filters: see the file doc comment on ordering)
        const watchResult = reconcile({
            localContent: craftFilterWatches(),
            syncMeta: watchSyncMeta!,
            remote: remoteWatchesFrom(active.db.myCraftFilterWatch.iter()),
            nowMs,
        });
        watchSyncMeta = watchResult.syncMeta;
        saveSyncMeta(WATCH_SYNC_META_KEY, watchSyncMeta);

        if (Object.keys(watchResult.localUpserts).length > 0 || watchResult.localRemovals.length > 0) {
            const next = {...craftFilterWatches()};
            for (const id of watchResult.localRemovals) delete next[id];
            for (const [id, triggers] of Object.entries(watchResult.localUpserts)) next[id] = triggers;
            setCraftFilterWatches(next);
        }

        for (const push of watchResult.pushes) {
            const updatedAt = Timestamp.fromDate(new Date(push.updatedAtMs));
            const call = push.upsert
                ? active.reducers.upsertCraftFilterWatch({
                    filterId: push.id,
                    added: push.upsert.added,
                    finished: push.upsert.finished,
                    removed: push.upsert.removed,
                    updatedAt,
                })
                : active.reducers.deleteCraftFilterWatch({filterId: push.id, deletedAt: updatedAt});
            call.catch(err => setLastError(describeServerError(err)));
        }

        for (const id of watchResult.conflicts) {
            reportConflict(id, id);
        }
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing: `subscribe()` runs synchronously inside the login-gated
        // `createEffect` below, and `conn.requestResource` internally *reads* this resource's own
        // `ready` signal (to decide whether to nudge a late joiner via `queueMicrotask`). Without
        // `untrack`, that read leaks into the effect's own dependency list — so the moment the
        // subscription actually applies and `ready` flips, the effect gets rescheduled, Solid
        // disposes its *previous* run first (auto-`onCleanup`-releasing the very resource we just
        // requested), and the re-run's `subscribe()` call sees a stale non-null `release` and
        // no-ops. The resource then sits at 0 refs and the manager's grace timer tears it down —
        // "filters:self" going quiet a few seconds after login, with `myAccount` staying live,
        // is this bug's exact signature.
        const request = untrack(() =>
            conn.requestResource(
                {key: "filters:self", tables: [bricoAppTable(tables.mySavedCraftFilter), bricoAppTable(tables.myCraftFilterWatch)]},
                () => {
                    // Set before `runReconcile()` so this very call already sees `resourceReady()`
                    // as true — `onChange` only fires once the SDK has actually applied the rows
                    // (or on a later row change), never speculatively.
                    setResourceReady(true);
                    runReconcile();
                },
            )
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setResourceReady(false);
    }

    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    // Any local settings-signal change. Harmless while logged out or not yet connected —
    // `runReconcile` bails immediately when there's no active connection.
    createEffect(() => {
        savedCraftFilters();
        craftFilterWatches();
        runReconcile();
    });

    return (
        <FilterSyncContext.Provider value={{lastError}}>
            {props.children}
        </FilterSyncContext.Provider>
    );
}

export function useFilterSync(): FilterSyncContextValue {
    const value = useContext(FilterSyncContext);
    if (!value) throw new Error("useFilterSync: no FilterSyncProvider above this component.");
    return value;
}
