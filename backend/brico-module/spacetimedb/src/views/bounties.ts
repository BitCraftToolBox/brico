// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {bounty_rule, craft_bounty_assignment, craft_bounty_override, craft_private_bounty_assignment} from '../tables/bounties';

/** The caller's own bounty rules, tombstoned ones included — same reason as `mySavedCraftFilter`. */
export const myBountyRule = spacetimedb.view(
    {name: 'my_bounty_rule', public: true},
    t.array(bounty_rule.rowType),
    ctx => ctx.from.bounty_rule.where(r => r.accountIdentity.eq(ctx.sender))
);

/** Unfiltered bounty-rule feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allBountyRule = spacetimedb.view(
    {name: 'all_bounty_rule', public: true},
    t.array(bounty_rule.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.bounty_rule.where(_ => isTrusted);
    }
);

/** The caller's own single-craft bounty overrides. */
export const myCraftBountyOverride = spacetimedb.view(
    {name: 'my_craft_bounty_override', public: true},
    t.array(craft_bounty_override.rowType),
    ctx => ctx.from.craft_bounty_override.where(o => o.accountIdentity.eq(ctx.sender))
);

/** Unfiltered override feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allCraftBountyOverride = spacetimedb.view(
    {name: 'all_craft_bounty_override', public: true},
    t.array(craft_bounty_override.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_bounty_override.where(_ => isTrusted);
    }
);

/** The resolved bounty for every craft — public in effect, so it's unconditional, no `my_` counterpart. */
export const allCraftBountyAssignment = spacetimedb.view(
    {name: 'all_craft_bounty_assignment', public: true},
    t.array(craft_bounty_assignment.rowType),
    ctx => ctx.from.craft_bounty_assignment.where(_ => true)
);

/** The caller's own private bounty assignments — lets a payer validate the private bounties they resolved, using the `by_assigned_by` index. */
export const myPrivateCraftBountyAssignment = spacetimedb.view(
    {name: 'my_private_craft_bounty_assignment', public: true},
    t.array(craft_private_bounty_assignment.rowType),
    ctx => ctx.from.craft_private_bounty_assignment.where(a => a.assignedByAccountIdentity.eq(ctx.sender))
);

/** Unfiltered private-bounty-assignment feed for brico-bot. Same trusted-constant-predicate query view as `all_account`. */
export const allPrivateCraftBountyAssignment = spacetimedb.view(
    {name: 'all_private_craft_bounty_assignment', public: true},
    t.array(craft_private_bounty_assignment.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.craft_private_bounty_assignment.where(_ => isTrusted);
    }
);
