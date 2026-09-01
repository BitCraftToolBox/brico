// noinspection JSUnusedGlobalSymbols

import {CraftError, MAX_FILTER_JSON_LENGTH, MAX_FILTER_NAME_LENGTH, MAX_SHARED_FILTER_IDS} from '@brico/crafts/errors';
import type {Random} from 'spacetimedb/server';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount} from '../lib/auth';
import {requireValidFilterJson} from '../lib/filters';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import {spacetimedb} from '../schema';

// ---------------------------------------------------------------------------
// Craft filter/watch sync
// ---------------------------------------------------------------------------

/**
 * Create or edit the caller's own saved filter. Editing (including re-editing a tombstoned row)
 * clears `deletedAt` — this is the "un-delete/resurrect" case the merge algorithm relies on.
 */
export const upsertSavedCraftFilter = spacetimedb.reducer(
    {id: t.string(), name: t.string(), filterJson: t.string(), updatedAt: t.timestamp()},
    (ctx, {id, name, filterJson, updatedAt}) => {
        requireAccount(ctx);
        if (name.length > MAX_FILTER_NAME_LENGTH) {
            throw new SenderError(CraftError.FILTER_NAME_TOO_LONG);
        }
        if (filterJson.length > MAX_FILTER_JSON_LENGTH) {
            throw new SenderError(CraftError.FILTER_TOO_LARGE);
        }
        requireValidFilterJson(filterJson);

        const existing = ctx.db.saved_craft_filter.id.find(id);
        if (existing !== null && !existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.FILTER_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.saved_craft_filter.insert({
                id,
                accountIdentity: ctx.sender,
                name,
                filterJson,
                createdAt: ctx.timestamp,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        } else {
            ctx.db.saved_craft_filter.id.update({
                ...existing,
                name,
                filterJson,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        }
    }
);

/**
 * Tombstones the caller's own saved filter (no hard delete — see the table's doc comment) and
 * cascades the tombstone to its watch row, if any, so a deleted filter doesn't leave a dangling
 * watch behind.
 */
export const deleteSavedCraftFilter = spacetimedb.reducer(
    {id: t.string(), deletedAt: t.timestamp()},
    (ctx, {id, deletedAt}) => {
        requireAccount(ctx);
        const existing = ctx.db.saved_craft_filter.id.find(id);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.FILTER_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedDeletedAt = clampClientTimestamp(ctx, deletedAt);
        if (!isAtLeastAsNew(clampedDeletedAt, existing.updatedAt)) return;

        ctx.db.saved_craft_filter.id.update({...existing, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});

        const watch = ctx.db.craft_filter_watch.filterId.find(id);
        if (watch !== null && watch.deletedAt === undefined) {
            ctx.db.craft_filter_watch.filterId.update({...watch, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});
        }
    }
);

/**
 * Create or edit the watch on one of the caller's own saved filters. Requires the referenced
 * `saved_craft_filter` to exist and belong to the caller — a watch can't outlive or outrun its
 * filter's ownership.
 */
export const upsertCraftFilterWatch = spacetimedb.reducer(
    {filterId: t.string(), added: t.bool(), finished: t.bool(), removed: t.bool(), updatedAt: t.timestamp()},
    (ctx, {filterId, added, finished, removed, updatedAt}) => {
        requireAccount(ctx);

        const filter = ctx.db.saved_craft_filter.id.find(filterId);
        if (filter === null || !filter.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER);
        }

        const existing = ctx.db.craft_filter_watch.filterId.find(filterId);
        if (existing !== null && !existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.WATCH_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.craft_filter_watch.insert({
                filterId,
                accountIdentity: ctx.sender,
                added,
                finished,
                removed,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        } else {
            ctx.db.craft_filter_watch.filterId.update({
                ...existing,
                added,
                finished,
                removed,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        }
    }
);

/** Tombstones the caller's own watch row (no hard delete). */
export const deleteCraftFilterWatch = spacetimedb.reducer(
    {filterId: t.string(), deletedAt: t.timestamp()},
    (ctx, {filterId, deletedAt}) => {
        requireAccount(ctx);
        const existing = ctx.db.craft_filter_watch.filterId.find(filterId);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.WATCH_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedDeletedAt = clampClientTimestamp(ctx, deletedAt);
        if (!isAtLeastAsNew(clampedDeletedAt, existing.updatedAt)) return;

        ctx.db.craft_filter_watch.filterId.update({...existing, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});
    }
);

// ---------------------------------------------------------------------------
// Saved filter sharing
// ---------------------------------------------------------------------------
//
// Two **procedures**, not reducers — a reducer cannot return a value to its caller, and the whole point
// of `createSharedFilters` is handing the freshly-minted code straight back. Both do their
// account/ownership checks and their single write inside one `ctx.withTx(...)` — a procedure's
// outer `ProcedureCtx` has no `.db`/`.senderAuth` of its own, only the `TransactionCtx` a
// `withTx` callback receives does (it's a plain `ReducerCtx` under a different name).

/** 30 characters: digits 2-9 and A-Z, minus the visually-ambiguous `0 1 7 I L O`. */
const SHARE_CODE_ALPHABET = '2345689ABCDEFGHJKMNPQRSTUVWXYZ';
const SHARE_CODE_LENGTH = 6;

/** Six characters from `SHARE_CODE_ALPHABET`, using the procedure's own deterministic RNG. */
function generateShareCode(random: Random): string {
    let code = '';
    for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
        code += SHARE_CODE_ALPHABET[random.integerInRange(0, SHARE_CODE_ALPHABET.length - 1)];
    }
    return code;
}

const CreateSharedFiltersResult = t.object('CreateSharedFiltersResult', {
    code: t.string(),
});

/**
 * Mints a share code for one or more of the caller's own saved filters. Ownership of every id in
 * `filterIds` is checked inside the same transaction that inserts the `shared_filter` row, so a
 * filter deleted or transferred mid-call can't slip a code past the check.
 */
export const createSharedFilters = spacetimedb.procedure(
    {filterIds: t.array(t.string())},
    CreateSharedFiltersResult,
    (ctx, {filterIds}) => {
        if (filterIds.length === 0) throw new SenderError(CraftError.NO_FILTERS_SELECTED);
        if (filterIds.length > MAX_SHARED_FILTER_IDS) {
            throw new SenderError(CraftError.TOO_MANY_FILTERS_SELECTED);
        }

        return ctx.withTx(tx => {
            if (tx.db.account.identity.find(ctx.sender) === null) {
                throw new SenderError(CraftError.NO_BRICO_ACCOUNT);
            }
            for (const id of filterIds) {
                const filter = tx.db.saved_craft_filter.id.find(id);
                if (filter === null || !filter.accountIdentity.isEqual(ctx.sender) || filter.deletedAt !== undefined) {
                    throw new SenderError(CraftError.UNKNOWN_SAVED_FILTER);
                }
            }

            // Collisions are astronomically unlikely at 30^6 codes, but cheap to guard against outright
            // rather than ever hand back a code that silently overwrites someone else's share.
            let code = generateShareCode(tx.random);
            for (let attempt = 0; attempt < 5 && tx.db.shared_filter.code.find(code) !== null; attempt++) {
                code = generateShareCode(tx.random);
            }
            if (tx.db.shared_filter.code.find(code) !== null) {
                throw new SenderError(CraftError.SHARE_CODE_GENERATION_FAILED);
            }

            tx.db.shared_filter.insert({
                code,
                accountIdentity: ctx.sender,
                filterIds: [...filterIds],
                createdAt: tx.timestamp,
            });
            return {code};
        });
    }
);

const SharedFilterRow = t.object('SharedFilterRow', {
    name: t.string(),
    filterJson: t.string(),
});

const ReadSharedFiltersResult = t.object('ReadSharedFiltersResult', {
    filters: t.array(SharedFilterRow),
});

/**
 * Redeems a share code into the `{name, filterJson}` pairs it points to. The filter ids themselves
 * never leave this procedure: only the saved filter's own content comes back, so a recipient can
 * import it but never learn (or reference) the sharer's `saved_craft_filter.id`.
 * This is callable anonymously to allow redemption of share links without an account.
 */
export const readSharedFilters = spacetimedb.procedure(
    {code: t.string()},
    ReadSharedFiltersResult,
    (ctx, {code}) => {
        return ctx.withTx(tx => {
            const shared = tx.db.shared_filter.code.find(code);
            if (shared === null) throw new SenderError(CraftError.UNKNOWN_SHARE_CODE);

            const filters: { name: string; filterJson: string }[] = [];
            for (const id of shared.filterIds) {
                const filter = tx.db.saved_craft_filter.id.find(id);
                if (filter === null/* || filter.deletedAt !== undefined*/) continue;
                filters.push({name: filter.name, filterJson: filter.filterJson});
            }
            return {filters};
        });
    }
);
