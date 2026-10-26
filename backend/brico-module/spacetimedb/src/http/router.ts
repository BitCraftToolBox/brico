// noinspection JSUnusedGlobalSymbols

import {Router} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {dashboard} from './dashboard';
import {payeeEntitlements, payeeLog, payerEntitlements, payerLog} from './payouts';

export const httpRoutes = spacetimedb.httpRouter(
    new Router()
        .get('/payouts/payer/entitlements', payerEntitlements)
        .get('/payouts/payer/log', payerLog)
        .get('/payouts/payee/entitlements', payeeEntitlements)
        .get('/payouts/payee/log', payeeLog)
        .get('/dashboard', dashboard)
);
