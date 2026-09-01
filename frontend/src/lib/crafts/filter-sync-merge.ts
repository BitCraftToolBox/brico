/**
 * filter-sync-merge.ts — the pure reconciliation algorithm behind `filter-sync.tsx`.
 *
 * Framework-free and dependency-free on purpose (same reasoning as `@brico/crafts/filter`): the
 * merge decision (push / pull / no-op / conflict) is exactly the same shape for saved filters and
 * for their watch triggers, so one generic function runs both, parameterized only by the entity's
 * content type and a content hash. Kept separate from `filter-sync.tsx` so it can be unit-tested
 * with no Solid/SSR concerns.
 *
 * A device's memory of "what it last synced" is `SyncMetaMap`: one entry per id, holding the local
 * edit clock (`updatedAt`, milliseconds — comparable directly against a remote row's `updatedAt`,
 * both ultimately derived from `Date.now()`), an optional local-delete marker (`deletedAt`), and a
 * `contentHash` used only to detect whether local content actually changed since the last time
 * this function looked at it (not a security- or collision-resistant hash — `JSON.stringify` is
 * plenty for "did this change").
 */

export interface SyncMetaEntry {
    updatedAt: number;
    deletedAt?: number;
    contentHash: string;
}

export type SyncMetaMap = Record<string, SyncMetaEntry>;

/** One row as it exists on `brico-app`, already flattened out of the generated row shape. */
export interface RemoteEntityRow<TContent> {
    content: TContent;
    updatedAtMs: number;
    deletedAtMs: number | null;
}

/** What the caller should actually call a reducer with. `upsert === null` means "call delete". */
export interface PushInstruction<TContent> {
    id: string;
    updatedAtMs: number;
    upsert: TContent | null;
}

export interface ReconcileResult<TContent> {
    /** The caller's new `SyncMetaMap` — persist this (replacing the one passed in). */
    syncMeta: SyncMetaMap;
    /** Local content to create or overwrite, by id. */
    localUpserts: Record<string, TContent>;
    /** Ids to remove from local content entirely. */
    localRemovals: string[];
    /** Reducer calls to make, in order — filters (or a filter's own upsert) before its watch. */
    pushes: PushInstruction<TContent>[];
    /**
     * Ids where this device had its own unsynced edit that this pass just overwrote with a newer
     * remote version — the caller shows a dismissible "overwritten by another device" toast for
     * each of these, not for an ordinary sync-down.
     */
    conflicts: string[];
}

function defaultHash(content: unknown): string {
    return JSON.stringify(content);
}

/**
 * Runs one full reconcile pass: local-change detection (step 1) followed by comparison against
 * `remote` (step 2), exactly as described in the notifications plan. Pure — no I/O, no reactivity;
 * `nowMs` is threaded through explicitly so this is deterministic under test.
 */
export function reconcile<TContent>(args: {
    localContent: Record<string, TContent>;
    syncMeta: SyncMetaMap;
    remote: Record<string, RemoteEntityRow<TContent>>;
    nowMs: number;
    hashContent?: (content: TContent) => string;
}): ReconcileResult<TContent> {
    const {localContent, remote, nowMs} = args;
    const hashContent = args.hashContent ?? (defaultHash as (content: TContent) => string);
    // Kept separate from the mutable `syncMeta` below: step 1 immediately re-syncs a changed id's
    // `contentHash` to match its new local content, so by the time step 2 runs, `syncMeta[id]` no
    // longer tells us whether id was *just* edited — only `originalSyncMeta[id]` (this pass's
    // input) still reflects the last state this device knows the server agreed with, which is what
    // the conflict check below needs to compare against.
    const originalSyncMeta = args.syncMeta;
    const syncMeta: SyncMetaMap = {...args.syncMeta};
    const localUpserts: Record<string, TContent> = {};
    const localRemovals: string[] = [];
    const pushes: PushInstruction<TContent>[] = [];
    const conflicts: string[] = [];

    // Step 1: local-change detection. Only touches ids already known locally or in syncMeta —
    // remote-only ids are step 2's job.
    const localAndKnownIds = new Set([...Object.keys(localContent), ...Object.keys(syncMeta)]);
    for (const id of localAndKnownIds) {
        const local = localContent[id];
        const meta = syncMeta[id];
        if (local !== undefined) {
            const hash = hashContent(local);
            // A hash mismatch is an edit; `meta.deletedAt` set while content is present locally
            // means this id was resurrected (re-created after being deleted) — also an edit.
            if (!meta || meta.contentHash !== hash || meta.deletedAt !== undefined) {
                syncMeta[id] = {updatedAt: nowMs, deletedAt: undefined, contentHash: hash};
            }
        } else if (meta && meta.deletedAt === undefined) {
            syncMeta[id] = {...meta, deletedAt: nowMs, updatedAt: nowMs};
        }
    }

    // Step 2: reconcile against remote.
    const allIds = new Set([...localAndKnownIds, ...Object.keys(remote)]);
    for (const id of allIds) {
        const local = localContent[id];
        const meta = syncMeta[id];
        const remoteRow = remote[id];

        if (!remoteRow) {
            // Local-only: push if we have anything to say about this id at all.
            if (meta) {
                pushes.push({id, updatedAtMs: meta.updatedAt, upsert: meta.deletedAt === undefined ? (local ?? null) : null});
            }
            continue;
        }

        if (!meta) {
            // Remote-only, never seen locally on this device.
            if (remoteRow.deletedAtMs === null) {
                localUpserts[id] = remoteRow.content;
                syncMeta[id] = {updatedAt: remoteRow.updatedAtMs, deletedAt: undefined, contentHash: hashContent(remoteRow.content)};
            }
            // Tombstoned remotely and never seen locally: nothing to do.
            continue;
        }

        // Both known.
        if (meta.updatedAt === remoteRow.updatedAtMs) continue;
        if (meta.updatedAt > remoteRow.updatedAtMs) {
            pushes.push({id, updatedAtMs: meta.updatedAt, upsert: meta.deletedAt === undefined ? (local ?? null) : null});
            continue;
        }

        // Remote newer: pull, and flag a conflict if this device had its own unsynced edit that
        // is about to be overwritten — compared against `originalSyncMeta`, the *last state this
        // device knew the server agreed with*, not `meta` (which step 1 already re-synced to
        // match local content, so it would never differ from local here).
        const original = originalSyncMeta[id];
        if (local !== undefined && original && hashContent(local) !== original.contentHash) {
            conflicts.push(id);
        }
        if (remoteRow.deletedAtMs !== null) {
            localRemovals.push(id);
            syncMeta[id] = {updatedAt: remoteRow.updatedAtMs, deletedAt: remoteRow.deletedAtMs, contentHash: meta.contentHash};
        } else {
            localUpserts[id] = remoteRow.content;
            syncMeta[id] = {updatedAt: remoteRow.updatedAtMs, deletedAt: undefined, contentHash: hashContent(remoteRow.content)};
        }
    }

    return {syncMeta, localUpserts, localRemovals, pushes, conflicts};
}
