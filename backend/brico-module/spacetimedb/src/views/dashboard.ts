// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {dashboardBounties, dashboardPayees, publicDashboardOwner} from '../lib/dashboard';
import {spacetimedb} from '../schema';

// The three views below take a `publicDashboard` API key as their argument and return nothing for an
// unknown key or one without that scope. Anyone holding the key can subscribe, so they carry only
// what `lib/dashboard.ts` allows.

const DashboardPayeeRow = t.row('DashboardPayeeRow', {
    payeePlayerId: t.u64(),
    payeeName: t.option(t.string()),
    currency: t.string(),
    effortTotal: t.i64(),
    earnedTotal: t.i64(),
    paidTotal: t.i64(),
});

const DashboardBountyRow = t.row('DashboardBountyRow', {
    craftId: t.u64(),
    ratioNumerator: t.i64(),
    ratioDenominator: t.i64(),
    currency: t.string(),
    private: t.bool(),
});

const DashboardKeyRow = t.row('DashboardKeyRow', {
    key: t.string(),
    name: t.string(),
});

/** One row while `key` is a live `publicDashboard` key, none otherwise; tells a revoked key from an empty dashboard. */
export const dashboardKey = spacetimedb.anonymousView(
    {name: 'dashboard_key', public: true},
    {key: t.string()},
    t.array(DashboardKeyRow),
    (ctx, {key}) => {
        const row = publicDashboardOwner(ctx.db, key);
        if (row === null) return [];
        return [{key, name: row.name}];
    }
);

/** The key owner's payees, one row per payee and currency. */
export const dashboardPayee = spacetimedb.anonymousView(
    {name: 'dashboard_payee', public: true},
    {key: t.string()},
    t.array(DashboardPayeeRow),
    (ctx, {key}) => {
        const {owner} = publicDashboardOwner(ctx.db, key) ?? {};
        return owner === undefined ? [] : dashboardPayees(ctx.db, owner);
    }
);

/** The key owner's active bounties, public and private. */
export const dashboardBounty = spacetimedb.anonymousView(
    {name: 'dashboard_bounty', public: true},
    {key: t.string()},
    t.array(DashboardBountyRow),
    (ctx, {key}) => {
        const {owner} = publicDashboardOwner(ctx.db, key) ?? {};
        return owner === undefined ? [] : dashboardBounties(ctx.db, owner);
    }
);
