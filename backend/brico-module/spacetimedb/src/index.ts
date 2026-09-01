/*
 * brico-app — brico's own SpacetimeDB module.
 *
 * Split by area:
 *   - accounts:      identity/account lifecycle
 *   - integrations:  auth-provider links (BitAuth, Discord, Stelo) and the shared out-of-band link-request flow
 *   - crafts:        craft filter/watch sync and filter sharing
 *   - notifications: generic, craft-sourced notifications
 *   - bounties:      bounty rules, per-craft overrides and resolved assignments
 *   - payouts:       entitlement ledgers, payment records and manual loyalty rewards
 */

export {default} from './schema';

export * from './reducers/accounts';
export * from './reducers/integrations';
export * from './reducers/crafts';
export * from './reducers/notifications';
export * from './reducers/bounties';
export * from './reducers/payouts';

export * from './views/accounts';
export * from './views/integrations';
export * from './views/crafts';
export * from './views/notifications';
export * from './views/bounties';
export * from './views/payouts';
