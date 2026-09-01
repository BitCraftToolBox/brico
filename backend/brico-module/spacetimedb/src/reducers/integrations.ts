// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import type {Identity} from 'spacetimedb';
import {ScheduleAt} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal, requireTrustedJwt} from '../lib/auth';
import type {Ctx} from '../schema';
import {spacetimedb} from '../schema';
import {integration_link_request} from '../tables/integrations';

/**
 * Shared body of `linkIntegration` and `tryFinalizeIntegrationLink` below. Enforces "at most one
 * active brico account per (provider, externalId)".
 */
function linkIntegrationInternal(
    ctx: Ctx,
    accountIdentity: Identity,
    provider: string,
    externalId: string,
    externalHandle: string | undefined,
): void {
    const account = ctx.db.account.identity.find(accountIdentity);
    if (account === null) {
        throw new SenderError(CraftError.UNKNOWN_BRICO_ACCOUNT);
    }

    for (const row of ctx.db.linked_integration.by_provider_external_id.filter([
        provider,
        externalId,
    ])) {
        if (row.revokedAt !== undefined) continue;
        // Re-linking the same account to its own already-active link is a no-op (keeps `linkedAt`);
        // any other account holding an active link on this external id is the attribution hole above.
        if (row.accountIdentity.isEqual(accountIdentity)) return;
        throw new SenderError(CraftError.EXTERNAL_ACCOUNT_ALREADY_LINKED);
    }

    if (!externalHandle?.trim()) externalHandle = undefined;

    ctx.db.linked_integration.insert({
        id: 0n,
        accountIdentity,
        provider,
        externalId,
        externalHandle,
        linkedAt: ctx.timestamp,
        revokedAt: undefined,
    });

    // UX convenience, not identity: set display name on first time link.
    if (provider === 'bitcraft-ea2' && externalHandle && account.displayName === undefined) {
        const activeBitcraftLinks = [...ctx.db.linked_integration.accountIdentity.filter(accountIdentity)]
            .filter(link => link.provider === 'bitcraft-ea2' && link.revokedAt === undefined);
        if (activeBitcraftLinks.length === 1) {
            ctx.db.account.identity.update({...account, displayName: externalHandle});
        }
    }
}

/**
 * Written by brico-bot after it has verified control of the external account out-of-band.
 */
export const linkIntegration = spacetimedb.reducer(
    {
        accountIdentity: t.identity(),
        provider: t.string(),
        externalId: t.string(),
        externalHandle: t.string(),
    },
    (ctx, {accountIdentity, provider, externalId, externalHandle}) => {
        requireServicePrincipal(ctx);
        linkIntegrationInternal(ctx, accountIdentity, provider, externalId, externalHandle);
    }
);

/** Revocation is soft, so the link history survives. Callable by the owner or by brico-bot. */
export const unlinkIntegration = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        const row = ctx.db.linked_integration.id.find(id);
        if (row === null) throw new SenderError(CraftError.UNKNOWN_INTEGRATION_LINK);
        if (!row.accountIdentity.isEqual(ctx.sender)) requireServicePrincipal(ctx);
        if (row.revokedAt !== undefined) return;
        ctx.db.linked_integration.id.update({...row, revokedAt: ctx.timestamp});
    }
);

// ---------------------------------------------------------------------------
// Integration link requests — shared out-of-band verification correlation
// ---------------------------------------------------------------------------

/** Long enough to survive an OIDC redirect round trip, short enough that an abandoned attempt doesn't linger. */
const LINK_TTL_MICROS = 15n * 60n * 1_000_000n;

type IntegrationLinkRequestRow = NonNullable<
    ReturnType<Ctx['db']['integration_link_request']['id']['find']>
>;

/**
 * Row is auto-deleted once this runs (scheduled-table semantics); nothing else to do.
 * `onSchedule: integration_link_request` (rather than the table's own, deprecated `scheduled`
 * option) is what wires this reducer to the table without `tables/integrations.ts` needing to
 * import anything from this file.
 */
export const expireIntegrationLinkRequest = spacetimedb.reducer(
    {onSchedule: integration_link_request},
    {request: integration_link_request.rowType},
    () => {
    }
);

/**
 * Once both `accountIdentity` and `externalId` are known, finalizes into a `linked_integration`
 * row and deletes the pending request; otherwise persists whichever side the caller just filled
 * in. Called by both completion paths below (`claimIntegrationLink`, `noteIntegrationLinkExternal`)
 * — the one thing that differs between a browser-initiated and a bot-initiated request is *which*
 * side was filled in at creation, not how finalization works.
 */
function tryFinalizeIntegrationLink(ctx: Ctx, request: IntegrationLinkRequestRow): void {
    if (request.accountIdentity !== undefined && request.externalId !== undefined) {
        linkIntegrationInternal(
            ctx,
            request.accountIdentity,
            request.provider,
            request.externalId,
            request.externalHandle,
        );
        ctx.db.integration_link_request.id.delete(request.id);
    } else {
        ctx.db.integration_link_request.id.update(request);
    }
}

/**
 * Browser side, already logged in — used when the flow starts on brico (BitAuth redirect, Stelo
 * wallet linking): the browser generates `code`, redirects out to `brico-bot` for verification,
 * and `noteIntegrationLinkExternal` below finalizes once the bot round-trips back.
 */
export const beginIntegrationLink = spacetimedb.reducer(
    {code: t.string(), provider: t.string()},
    (ctx, {code, provider}) => {
        requireAccount(ctx);
        if (ctx.db.integration_link_request.code.find(code) !== null) {
            throw new SenderError(CraftError.LINK_CODE_ALREADY_IN_USE);
        }
        ctx.db.integration_link_request.insert({
            id: 0n,
            scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + LINK_TTL_MICROS),
            code,
            provider,
            accountIdentity: ctx.sender,
            externalId: undefined,
            externalHandle: undefined,
            createdAt: ctx.timestamp,
        });
    }
);

/**
 * Bot side — used when the flow starts on the external system (e.g. a Discord slash command that
 * already knows the caller's Discord id but not their brico account yet). `claimIntegrationLink`
 * below finalizes once the user opens the link brico-bot hands back and is logged in.
 */
export const beginIntegrationLinkForExternal = spacetimedb.reducer(
    {
        code: t.string(),
        provider: t.string(),
        externalId: t.string(),
        externalHandle: t.option(t.string()),
    },
    (ctx, {code, provider, externalId, externalHandle}) => {
        requireServicePrincipal(ctx);
        if (ctx.db.integration_link_request.code.find(code) !== null) {
            throw new SenderError(CraftError.LINK_CODE_ALREADY_IN_USE);
        }
        ctx.db.integration_link_request.insert({
            id: 0n,
            scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + LINK_TTL_MICROS),
            code,
            provider,
            accountIdentity: undefined,
            externalId,
            externalHandle,
            createdAt: ctx.timestamp,
        });
    }
);

/** Browser fills in `accountIdentity` for a bot-initiated request (Discord `/link` redemption). */
export const claimIntegrationLink = spacetimedb.reducer(
    {code: t.string()},
    (ctx, {code}) => {
        requireAccount(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        if (request.accountIdentity !== undefined) {
            throw new SenderError(CraftError.LINK_CODE_ALREADY_CLAIMED);
        }
        tryFinalizeIntegrationLink(ctx, {...request, accountIdentity: ctx.sender});
    }
);

/** Bot fills in `externalId` for a browser-initiated request (BitAuth callback, Stelo confirmation). */
export const noteIntegrationLinkExternal = spacetimedb.reducer(
    {code: t.string(), externalId: t.string(), externalHandle: t.option(t.string())},
    (ctx, {code, externalId, externalHandle}) => {
        requireServicePrincipal(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        if (request.externalId !== undefined) {
            throw new SenderError(CraftError.LINK_CODE_ALREADY_RESOLVED);
        }
        tryFinalizeIntegrationLink(ctx, {...request, externalId, externalHandle});
    }
);

/**
 * Discord-login shortcut: when a user's SpacetimeAuth login method is Discord, the ID token that
 * authenticated this very connection already carries the Discord snowflake (`provider_id`) and
 * display name (`preferred_username`).
 */
export const linkDiscordViaSpacetimeAuth = spacetimedb.reducer(ctx => {
    requireAccount(ctx);
    const claims = requireTrustedJwt(ctx).fullPayload;
    if (claims.login_method !== 'discord') {
        throw new SenderError(CraftError.LOGIN_NOT_VIA_DISCORD);
    }
    const externalId = claims.provider_id;
    if (typeof externalId !== 'string' || externalId === '') {
        throw new SenderError(CraftError.DISCORD_CLAIMS_MISSING_PROVIDER_ID);
    }
    const externalHandle = typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : undefined;
    linkIntegrationInternal(ctx, ctx.sender, 'discord', externalId, externalHandle);
});
