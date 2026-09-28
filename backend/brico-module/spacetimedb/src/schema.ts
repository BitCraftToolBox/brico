import type {InferSchema, ReducerCtx, ViewCtx} from 'spacetimedb/server';
import {schema} from 'spacetimedb/server';
import {account, service_principal} from './tables/accounts';
import {bounty_rule, craft_bounty_assignment, craft_bounty_override, craft_private_bounty_assignment} from './tables/bounties';
import {craft_filter_watch, saved_craft_filter, shared_filter} from './tables/crafts';
import {discord_guild_install, discord_notify_sink, discord_notify_target, discord_watch_display} from './tables/discord';
import {integration_link_request, linked_integration} from './tables/integrations';
import {notification} from './tables/notifications';
import {craft_filter_notify_trigger} from './tables/notify';
import {
    bounty_entitlement_total,
    bounty_payout_record,
    bounty_payout_record_log,
    craft_bounty_entitlement,
    loyalty_bonus_total,
    loyalty_reward,
    loyalty_rule
} from './tables/payouts';

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
    bounty_payout_record_log,
    loyalty_reward,
    loyalty_rule,
    loyalty_bonus_total,
    discord_watch_display,
    discord_notify_sink,
    discord_notify_target,
    craft_filter_notify_trigger,
    discord_guild_install,
});

export {spacetimedb};
export default spacetimedb;

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export type VCtx = ViewCtx<InferSchema<typeof spacetimedb>>;
