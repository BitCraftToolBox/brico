/**
 * filter-sync.tsx — syncs saved craft filters (`saved_craft_filter`) and their Toast triggers
 * (`craft_filter_notify_trigger` with `sink: {tag: "Toast"}`) between localStorage and `brico-app`.
 * The merge decision is `filter-sync-merge.ts`'s `reconcile()`; this file is the Solid/SpacetimeDB wiring.
 * Discord notification settings are login-only and live in `discord-notify-settings.ts`, not here.
 *
 * Filters are reconciled before triggers within one pass: the trigger reducer requires its saved
 * filter to exist server-side, and calls on one connection are processed in send order.
 */
import {tables} from "@brico/bindings/brico-app";
import type {CraftFilterNotifyTrigger, SavedCraftFilter as RemoteSavedCraftFilter} from "@brico/bindings/brico-app/types";
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
const TOAST_TRIGGER_SYNC_META_KEY = "brico:crafts:toast-trigger-sync-meta";

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

/** `remote`/`remoteIdByKey` for the Toast slice of `craft_filter_notify_trigger`, keyed by `filterId`. */
function remoteToastTriggersFrom(
    rows: Iterable<CraftFilterNotifyTrigger>,
): {remote: Record<string, RemoteEntityRow<CraftWatchTriggers>>; remoteIdByKey: Map<string, string>} {
    const remote: Record<string, RemoteEntityRow<CraftWatchTriggers>> = {};
    const remoteIdByKey = new Map<string, string>();
    for (const row of rows) {
        if (row.sink.tag !== "Toast") continue;
        remote[row.filterId] = {
            content: {added: row.added, finished: row.finished, removed: row.removed},
            updatedAtMs: Number(row.updatedAt.toMillis()),
            deletedAtMs: row.deletedAt !== undefined ? Number(row.deletedAt.toMillis()) : null,
        };
        remoteIdByKey.set(row.filterId, row.id);
    }
    return {remote, remoteIdByKey};
}

export interface FilterSyncContextValue {
    /** Message from the most recent failed push, if any. */
    lastError: () => string | null;
}

const FilterSyncContext = createContext<FilterSyncContextValue>();

export function FilterSyncProvider(props: {children: JSX.Element}) {
    const acc = useAccount();
    const {
        savedCraftFilters, setSavedCraftFilters,
        craftFilterWatches, setCraftFilterWatches,
    } = useSettings();
    const conn = useConnection(BRICO_APP_SERVER);

    const [lastError, setLastError] = createSignal<string | null>(null);

    // Whether the "filters:self" subscription has applied. Not the same as `conn.active()`, which
    // flips true as soon as `AccountProvider` opens the shared socket. Read inside `runReconcile` so
    // the effects that call it re-run once the resource is ready.
    const [resourceReady, setResourceReady] = createSignal(false);

    // Loaded lazily (not at module scope) so this never touches localStorage during SSR.
    let filterSyncMeta: SyncMetaMap | null = null;
    let toastTriggerSyncMeta: SyncMetaMap | null = null;
    function ensureMetaLoaded() {
        if (filterSyncMeta === null) filterSyncMeta = loadSyncMeta(FILTER_SYNC_META_KEY);
        if (toastTriggerSyncMeta === null) toastTriggerSyncMeta = loadSyncMeta(TOAST_TRIGGER_SYNC_META_KEY);
    }

    function reportConflict(name: string) {
        showToast({
            title: () => "Notification setting updated elsewhere",
            description: () => `An offline change to "${name}" was overwritten by a newer version from another device.`,
        });
    }

    function runReconcile() {
        if (isServer) return;
        const active = conn.active();
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
            reportConflict(savedCraftFilters().find(f => f.id === id)?.name ?? filterResult.localUpserts[id]?.name ?? id);
        }

        // --- Toast triggers (after filters, see file header) ---
        const {remote: toastRemote, remoteIdByKey: toastIdByFilterId} = remoteToastTriggersFrom(active.db.myCraftFilterNotifyTrigger.iter());
        const toastResult = reconcile({
            localContent: craftFilterWatches(),
            syncMeta: toastTriggerSyncMeta!,
            remote: toastRemote,
            nowMs,
        });
        toastTriggerSyncMeta = toastResult.syncMeta;
        saveSyncMeta(TOAST_TRIGGER_SYNC_META_KEY, toastTriggerSyncMeta);

        if (Object.keys(toastResult.localUpserts).length > 0 || toastResult.localRemovals.length > 0) {
            const next = {...craftFilterWatches()};
            for (const id of toastResult.localRemovals) delete next[id];
            for (const [id, triggers] of Object.entries(toastResult.localUpserts)) next[id] = triggers;
            setCraftFilterWatches(next);
        }

        for (const push of toastResult.pushes) {
            const updatedAt = Timestamp.fromDate(new Date(push.updatedAtMs));
            const id = toastIdByFilterId.get(push.id) ?? crypto.randomUUID();
            const call = push.upsert
                ? active.reducers.upsertCraftFilterNotifyTrigger({
                    id,
                    filterId: push.id,
                    sink: {tag: "Toast", value: {}},
                    added: push.upsert.added,
                    finished: push.upsert.finished,
                    removed: push.upsert.removed,
                    updatedAt,
                })
                : active.reducers.detachCraftFilterNotifyTrigger({id, deletedAt: updatedAt});
            call.catch(err => setLastError(describeServerError(err)));
        }

        for (const id of toastResult.conflicts) reportConflict(id);
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing: `conn.requestResource` reads the resource's own `ready` signal,
        // which would otherwise become a dependency of the calling effect; its re-run would dispose
        // (release) the resource just requested.
        const request = untrack(() =>
            conn.requestResource(
                {
                    key: "filters:self",
                    tables: [
                        bricoAppTable(tables.mySavedCraftFilter),
                        bricoAppTable(tables.myCraftFilterNotifyTrigger),
                    ],
                },
                () => {
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
