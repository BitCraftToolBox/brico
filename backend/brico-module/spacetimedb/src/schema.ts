import type {InferSchema, ReducerCtx, ViewCtx} from 'spacetimedb/server';
import {schema} from 'spacetimedb/server';
import {account, service_principal} from './tables/accounts';
import {bounty_rule, craft_bounty_assignment, craft_bounty_override, craft_private_bounty_assignment} from './tables/bounties';
import {craft_filter_watch, saved_craft_filter, shared_filter} from './tables/crafts';
import {integration_link_request, linked_integration} from './tables/integrations';
import {notification} from './tables/notifications';
import {bounty_entitlement_total, bounty_payout_record, craft_bounty_entitlement, loyalty_reward} from './tables/payouts';

const spacetimedb = schema({
    account,
    linked_integration,
    integration_link_request,
    service_principal,
    saved_craft_filter,
    craft_filter_watch,
    shared_filter,
    notification,
    bounty_rule,
    craft_bounty_override,
    craft_bounty_assignment,
    craft_private_bounty_assignment,
    craft_bounty_entitlement,
    bounty_entitlement_total,
    bounty_payout_record,
    loyalty_reward,
});

export {spacetimedb};
export default spacetimedb;

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export type VCtx = ViewCtx<InferSchema<typeof spacetimedb>>;
