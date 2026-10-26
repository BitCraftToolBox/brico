// noinspection JSUnusedGlobalSymbols

import {dashboardReport} from '../lib/dashboard';
import {spacetimedb} from '../schema';
import {serve} from './serve';

/**
 * The owner's public dashboard feed (routed in `router.ts`), authenticated by an API key with
 * `publicDashboard`. Anyone holding the key can read it, so it carries only what `dashboardReport` allows.
 */
export const dashboard = spacetimedb.httpHandler((ctx, req) => serve(ctx, req, 'publicDashboard', dashboardReport));
