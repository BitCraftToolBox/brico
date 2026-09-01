import {t, table} from 'spacetimedb/server';

// ---------------------------------------------------------------------------
// Bounties & payouts
// ---------------------------------------------------------------------------

export const GridCell = t.object('GridCell', {
    skillId: t.u32(),
    tier: t.u32(),
    ratioNumerator: t.i64(),
    ratioDenominator: t.i64(),
});

/**
 * A bounty rule's value: either one flat ratio, or a skill/tier grid.
 */
export const BountyRuleValue = t.enum('BountyRuleValue', {
    flat: t.object('FlatBountyValue', {
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
    }),
    grid: t.object('GridBountyValue', {
        cells: t.array(GridCell),
        currency: t.string(),
    }),
});

/**
 * A filter-based or skill/tier-grid bounty rule. `filterJson` must not
 * reference `payout`/`currency` — enforced as a hard error in the frontend's `FilterBuilder`,
 * again here in `upsertBountyRule` (`requireValidFilterJson(..., BOUNTY_RULE_DISALLOWED_FIELDS)`),
 * and `brico-bot` still skips/ignores any rule whose filter references them at evaluation time as a
 * last line of defense.
 */
export const bounty_rule = table(
    {name: 'bounty_rule'},
    {
        id: t.string().primaryKey(),
        accountIdentity: t.identity().index('btree'),
        /** Unique per account in practice — enforced by `reorderBountyRules` rewriting all of an
         * account's rules together, not by a database-level constraint. */
        priority: t.i32(),
        filterJson: t.string(),
        value: BountyRuleValue,
        /** When true, any assignment this rule produces goes to `craft_private_bounty_assignment` instead of the public `craft_bounty_assignment`. */
        private: t.bool(),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
        deletedAt: t.option(t.timestamp()),
    }
);

/**
 * The direct "add/remove a bounty on this one craft" action from the craft detail page. No
 * tombstone: deleting this row simply falls back to normal rule evaluation for that craft, same
 * as never having set it.
 */
export const craft_bounty_override = table(
    {name: 'craft_bounty_override'},
    {
        craftId: t.u64().primaryKey(),
        accountIdentity: t.identity(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
        /** When true, this override's assignment goes to `craft_private_bounty_assignment` instead of the public `craft_bounty_assignment`. */
        private: t.bool(),
        updatedAt: t.timestamp(),
    }
);

/**
 * The resolved, effectively-public bounty for a craft. Only `brico-bot` ever writes this table.
 */
export const craft_bounty_assignment = table(
    {name: 'craft_bounty_assignment'},
    {
        craftId: t.u64().primaryKey(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
        assignedByAccountIdentity: t.identity(),
        assignedAt: t.timestamp(),
        updatedAt: t.timestamp(),
    }
);

/**
 * Same shape as `craft_bounty_assignment`, but for bounties whose rule/override was marked
 * `private`. Never surfaced through `all_craft_bounty_assignment` view. Instead, indexed on
 * the assigning account so `myPrivateCraftBountyAssignment` can let a payer validate their
 * own private bounties.
 */
export const craft_private_bounty_assignment = table(
    {name: 'craft_private_bounty_assignment'},
    {
        craftId: t.u64().primaryKey(),
        ratioNumerator: t.i64(),
        ratioDenominator: t.i64(),
        currency: t.string(),
        assignedByAccountIdentity: t.identity().index('btree'),
        assignedAt: t.timestamp(),
        updatedAt: t.timestamp(),
    }
);
