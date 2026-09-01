// noinspection JSUnusedGlobalSymbols

import {CraftError, MAX_FILTER_JSON_LENGTH} from '@brico/crafts/errors';
import type {FilterField} from '@brico/crafts/filter';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {validateBountyCurrency, validateRatio} from '../lib/bounty';
import {requireValidFilterJson} from '../lib/filters';
import {clampClientTimestamp, isAtLeastAsNew} from '../lib/sync';
import {spacetimedb} from '../schema';
import {BountyRuleValue} from '../tables/bounties';

// ---------------------------------------------------------------------------
// Bounties & payouts
// ---------------------------------------------------------------------------

/**
 * `payout`/`currency` are excluded here too (see the `bounty_rule` table's doc comment) — a rule
 * that could condition on the very bounty it assigns is circular.
 */
const BOUNTY_RULE_DISALLOWED_FIELDS: readonly FilterField[] = ['payout', 'currency'];

/**
 * Create or edit one of the caller's own bounty rules. Editing (including re-editing a
 * tombstoned row) clears `deletedAt`, same "un-delete/resurrect" convention as
 * `upsertSavedCraftFilter`.
 */
export const upsertBountyRule = spacetimedb.reducer(
    {id: t.string(), filterJson: t.string(), value: BountyRuleValue, priority: t.i32(), private: t.bool(), updatedAt: t.timestamp()},
    (ctx, {id, filterJson, value, priority, private: isPrivate, updatedAt}) => {
        requireAccount(ctx);
        if (filterJson.length > MAX_FILTER_JSON_LENGTH) {
            throw new SenderError(CraftError.FILTER_TOO_LARGE);
        }
        requireValidFilterJson(filterJson, BOUNTY_RULE_DISALLOWED_FIELDS);
        validateBountyCurrency(value.value.currency);
        if (value.tag === 'flat') {
            validateRatio(value.value.ratioNumerator, value.value.ratioDenominator);
        } else {
            for (const cell of value.value.cells) validateRatio(cell.ratioNumerator, cell.ratioDenominator);
        }

        const existing = ctx.db.bounty_rule.id.find(id);
        if (existing !== null && !existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.RULE_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.bounty_rule.insert({
                id,
                accountIdentity: ctx.sender,
                priority,
                filterJson,
                value,
                private: isPrivate,
                createdAt: ctx.timestamp,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        } else {
            ctx.db.bounty_rule.id.update({
                ...existing,
                priority,
                filterJson,
                value,
                private: isPrivate,
                updatedAt: clampedUpdatedAt,
                deletedAt: undefined,
            });
        }
    }
);

/** Tombstones the caller's own bounty rule (no hard delete). */
export const deleteBountyRule = spacetimedb.reducer(
    {id: t.string(), deletedAt: t.timestamp()},
    (ctx, {id, deletedAt}) => {
        requireAccount(ctx);
        const existing = ctx.db.bounty_rule.id.find(id);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.RULE_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedDeletedAt = clampClientTimestamp(ctx, deletedAt);
        if (!isAtLeastAsNew(clampedDeletedAt, existing.updatedAt)) return;

        ctx.db.bounty_rule.id.update({...existing, updatedAt: clampedDeletedAt, deletedAt: clampedDeletedAt});
    }
);

/**
 * Rewrites `priority` to `0..N-1` for the caller's own rules, in the given order — this is what
 * actually enforces "unique priority per account" in practice, rather than a database-level
 * constraint. Ids in `orderedIds` that don't exist or belong to another account are silently
 * skipped, so a stale client-side list can't corrupt another account's rules. Always operates over
 * *all* of the caller's rules, not just the ones named in `orderedIds`: any of the caller's own
 * rules omitted from `orderedIds` are appended afterward (keeping their relative priority order),
 * so a partial list from the client can never leave two of the caller's own rules sharing a
 * priority.
 */
export const reorderBountyRules = spacetimedb.reducer(
    {orderedIds: t.array(t.string())},
    (ctx, {orderedIds}) => {
        requireAccount(ctx);

        const own = [...ctx.db.bounty_rule.accountIdentity.filter(ctx.sender)].sort((a, b) => a.priority - b.priority);
        const byId = new Map(own.map(rule => [rule.id, rule]));

        const seen = new Set<string>();
        const ordered: typeof own = [];
        for (const id of orderedIds) {
            const rule = byId.get(id);
            if (rule === undefined || seen.has(id)) continue;
            seen.add(id);
            ordered.push(rule);
        }
        for (const rule of own) {
            if (!seen.has(rule.id)) ordered.push(rule);
        }

        ordered.forEach((rule, index) => {
            if (rule.priority === index) return;
            ctx.db.bounty_rule.id.update({...rule, priority: index, updatedAt: ctx.timestamp});
        });
    }
);

/**
 * Create or edit the caller's own single-craft bounty override. No craft-ownership check at the
 * module level: only `brico-bot` can see prism's craft/claim ownership, so an invalid override
 * just never produces a `craft_bounty_assignment` when the bot evaluates it.
 */
export const upsertCraftBountyOverride = spacetimedb.reducer(
    {
        craftId: t.u64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
        private: t.bool(),
        updatedAt: t.timestamp(),
    },
    (ctx, {craftId, ratioNumerator, ratioDenominator, currency, private: isPrivate, updatedAt}) => {
        requireAccount(ctx);
        validateBountyCurrency(currency);
        validateRatio(ratioNumerator, ratioDenominator);

        const existing = ctx.db.craft_bounty_override.craftId.find(craftId);
        if (existing !== null && !existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.OVERRIDE_BELONGS_TO_ANOTHER_ACCOUNT);
        }

        const clampedUpdatedAt = clampClientTimestamp(ctx, updatedAt);
        if (existing !== null && !isAtLeastAsNew(clampedUpdatedAt, existing.updatedAt)) return;

        if (existing === null) {
            ctx.db.craft_bounty_override.insert({
                craftId,
                accountIdentity: ctx.sender,
                ratioNumerator,
                ratioDenominator,
                currency,
                private: isPrivate,
                updatedAt: clampedUpdatedAt,
            });
        } else {
            ctx.db.craft_bounty_override.craftId.update({
                ...existing,
                ratioNumerator,
                ratioDenominator,
                currency,
                private: isPrivate,
                updatedAt: clampedUpdatedAt,
            });
        }
    }
);

/** Deletes the caller's own override — a hard delete, unlike `bounty_rule`, since there's no sync backlog to reconcile. */
export const deleteCraftBountyOverride = spacetimedb.reducer(
    {craftId: t.u64()},
    (ctx, {craftId}) => {
        requireAccount(ctx);
        const existing = ctx.db.craft_bounty_override.craftId.find(craftId);
        if (existing === null) return;
        if (!existing.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.OVERRIDE_BELONGS_TO_ANOTHER_ACCOUNT);
        }
        ctx.db.craft_bounty_override.craftId.delete(craftId);
    }
);

/**
 * Written by `brico-bot` once it resolves a craft's bounty (override beats rule, priority order,
 * personal owner beats claim owner) — never directly by a browser, same reasoning as
 * `postCraftNotification`. Always a full upsert: the bot recomputes the whole row from scratch.
 *
 * `private` (sourced from whichever rule/override matched) selects which of the two mutually
 * exclusive assignment tables gets the row — the other table's row for this craft, if any, is
 * deleted, so a craft never has a resolved assignment in both at once (e.g. a rule that used to be
 * public and is now marked private).
 */
export const assignCraftBounty = spacetimedb.reducer(
    {
        craftId: t.u64(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
        assignedByAccountIdentity: t.identity(),
        private: t.bool(),
        assignedAt: t.timestamp(),
        updatedAt: t.timestamp(),
    },
    (ctx, {craftId, ratioNumerator, ratioDenominator, currency, assignedByAccountIdentity, private: isPrivate, assignedAt, updatedAt}) => {
        requireServicePrincipal(ctx);
        validateBountyCurrency(currency);
        if (ctx.db.account.identity.find(assignedByAccountIdentity) === null) {
            throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);
        }

        if (isPrivate) {
            if (ctx.db.craft_bounty_assignment.craftId.find(craftId) !== null) {
                ctx.db.craft_bounty_assignment.craftId.delete(craftId);
            }
            const existing = ctx.db.craft_private_bounty_assignment.craftId.find(craftId);
            if (existing === null) {
                ctx.db.craft_private_bounty_assignment.insert({
                    craftId, ratioNumerator, ratioDenominator, currency, assignedByAccountIdentity, assignedAt, updatedAt,
                });
            } else {
                ctx.db.craft_private_bounty_assignment.craftId.update({
                    ...existing, ratioNumerator, ratioDenominator, currency, assignedByAccountIdentity, assignedAt, updatedAt,
                });
            }
        } else {
            if (ctx.db.craft_private_bounty_assignment.craftId.find(craftId) !== null) {
                ctx.db.craft_private_bounty_assignment.craftId.delete(craftId);
            }
            const existing = ctx.db.craft_bounty_assignment.craftId.find(craftId);
            if (existing === null) {
                ctx.db.craft_bounty_assignment.insert({
                    craftId, ratioNumerator, ratioDenominator, currency, assignedByAccountIdentity, assignedAt, updatedAt,
                });
            } else {
                ctx.db.craft_bounty_assignment.craftId.update({
                    ...existing, ratioNumerator, ratioDenominator, currency, assignedByAccountIdentity, assignedAt, updatedAt,
                });
            }
        }
    }
);

/** Written by `brico-bot` when a craft no longer resolves to any override or matching rule, or the craft no longer exists in prism (post-24-hour-expiry). Clears both the public and private assignment tables — the bot doesn't need to know which one held the row. */
export const clearCraftBounty = spacetimedb.reducer(
    {craftId: t.u64()},
    (ctx, {craftId}) => {
        requireServicePrincipal(ctx);
        if (ctx.db.craft_bounty_assignment.craftId.find(craftId) !== null) {
            ctx.db.craft_bounty_assignment.craftId.delete(craftId);
        }
        if (ctx.db.craft_private_bounty_assignment.craftId.find(craftId) !== null) {
            ctx.db.craft_private_bounty_assignment.craftId.delete(craftId);
        }
    }
);
