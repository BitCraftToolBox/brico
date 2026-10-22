// noinspection JSUnusedGlobalSymbols

import {CraftError, MAX_DISPLAY_NAME_LENGTH} from '@brico/crafts/errors';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal, requireTrustedJwt} from '../lib/auth';
import {spacetimedb} from '../schema';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const init = spacetimedb.init(ctx => {
    // The publisher of the module is the first service principal; every other one is granted
    // by an existing principal. This avoids a first-call-wins race on a reachable instance.
    if (ctx.db.service_principal.identity.find(ctx.sender) === null) {
        ctx.db.service_principal.insert({
            identity: ctx.sender,
            label: 'module-publisher',
            grantedAt: ctx.timestamp,
        });
    }
});

/**
 * Deliberately does NOT create accounts. Real users (not service principals) must
 * explicitly call ensure_account to do that.
 */
export const onConnect = spacetimedb.clientConnected(ctx => {
    const existing = ctx.db.account.identity.find(ctx.sender);
    if (existing !== null) {
        ctx.db.account.identity.update({...existing, lastSeenAt: ctx.timestamp});
    }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
    const existing = ctx.db.account.identity.find(ctx.sender);
    if (existing !== null) {
        ctx.db.account.identity.update({...existing, lastSeenAt: ctx.timestamp});
    }
});

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

/**
 * Provision the caller's brico account, idempotently. This is the one call a freshly
 * logged-in client makes; calling it again just refreshes `lastSeenAt`.
 *
 * `issuer`/`subject` are read from `ctx.senderAuth.jwt`, never from arguments.
 */
export const ensureAccount = spacetimedb.reducer(ctx => {
    const jwt = requireTrustedJwt(ctx);
    if (ctx.db.service_principal.identity.find(ctx.sender) !== null) {
        throw new SenderError(CraftError.SERVICE_PRINCIPAL_CANNOT_HOLD_ACCOUNT);
    }

    const existing = ctx.db.account.identity.find(ctx.sender);
    if (existing !== null) {
        ctx.db.account.identity.update({...existing, lastSeenAt: ctx.timestamp});
        return;
    }
    ctx.db.account.insert({
        identity: ctx.sender,
        issuer: jwt.issuer,
        subject: jwt.subject,
        displayName: undefined,
        createdAt: ctx.timestamp,
        lastSeenAt: ctx.timestamp,
    });
});

/** A client renaming itself. */
export const setDisplayName = spacetimedb.reducer(
    {displayName: t.option(t.string())},
    (ctx, {displayName}) => {
        const existing = requireAccount(ctx);
        const trimmed = displayName?.trim();
        if (trimmed && trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
            throw new SenderError(CraftError.DISPLAY_NAME_TOO_LONG);
        }
        ctx.db.account.identity.update({
            ...existing,
            displayName: trimmed === undefined || trimmed === '' ? undefined : trimmed,
        });
    }
);

/** Grant full visibility and write access to another identity (e.g. brico-bot's service identity). */
export const registerServicePrincipal = spacetimedb.reducer(
    {identity: t.identity(), label: t.string()},
    (ctx, {identity, label}) => {
        requireServicePrincipal(ctx);
        if (ctx.db.service_principal.identity.find(identity) !== null) return;
        // The inverse of `ensure_account`'s guard.
        if (ctx.db.account.identity.find(identity) !== null) {
            throw new SenderError(CraftError.IDENTITY_ALREADY_HAS_ACCOUNT);
        }
        ctx.db.service_principal.insert({identity, label, grantedAt: ctx.timestamp});
    }
);

export const revokeServicePrincipal = spacetimedb.reducer(
    {identity: t.identity()},
    (ctx, {identity}) => {
        requireServicePrincipal(ctx);
        if (identity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.SERVICE_PRINCIPAL_CANNOT_REVOKE_SELF);
        }
        ctx.db.service_principal.identity.delete(identity);
    }
);
