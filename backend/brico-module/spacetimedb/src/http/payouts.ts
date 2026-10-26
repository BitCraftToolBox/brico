// noinspection JSUnusedGlobalSymbols

import {entitlementsAsContributor, entitlementsAsPayer, payoutLogAsContributor, payoutLogAsPayer} from '../lib/payouts';
import {spacetimedb} from '../schema';
import {serve} from './serve';

/*
 * Read-only payout reports over HTTP, one route per `my_*` payout view (routed in `router.ts`),
 * authenticated by an API key with `readPayouts` (`Authorization: Bearer <token>`, see
 * `createApiKey`) instead of a connection identity. Responses are JSON arrays shaped like the view rows.
 */

/** Same rows as `my_entitlements_as_payer`. */
export const payerEntitlements = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, 'readPayouts', entitlementsAsPayer));

/** Same rows as `my_bounty_payout_record_log_as_payer`. */
export const payerLog = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, 'readPayouts', payoutLogAsPayer));

/** Same rows as `my_entitlements_as_contributor`. */
export const payeeEntitlements = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, 'readPayouts', entitlementsAsContributor));

/** Same rows as `my_bounty_payout_record_log_as_contributor`. */
export const payeeLog = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, 'readPayouts', payoutLogAsContributor));
