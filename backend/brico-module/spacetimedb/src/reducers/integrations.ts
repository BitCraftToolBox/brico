// noinspection JSUnusedGlobalSymbols

import {CraftError} from '@brico/crafts/errors';
import {normalizeSteloAddress} from '@brico/crafts/stelo';
import type {Identity} from 'spacetimedb';
import {ScheduleAt} from 'spacetimedb';
import {SenderError, t} from 'spacetimedb/server';
import {requireAccount, requireServicePrincipal, requireTrustedJwt} from '../lib/auth';
import {removeSteloWallet} from '../lib/escrow';
import type {Ctx} from '../schema';
import {spacetimedb} from '../schema';
import {integration_link_request} from '../tables/integrations';

/** Providers whose external id may be linked by several brico accounts at once (a Stelo wallet shared by a guild). */
const SHARED_EXTERNAL_PROVIDERS: ReadonlySet<string> = new Set(['stelo']);

/**
 * Shared body of `linkIntegration` and `tryFinalizeIntegrationLink` below. Enforces "at most one
 * active brico account per (provider, externalId)" except for `SHARED_EXTERNAL_PROVIDERS`, where
 * only the same account linking twice is a no-op.
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

    if (!externalHandle?.trim()) externalHandle = undefined;

    for (const row of ctx.db.linked_integration.by_provider_external_id.filter([
        provider,
        externalId,
    ])) {
        if (row.revokedAt !== undefined) continue;
        // Re-linking the same account to its own already-active link keeps `linkedAt` and only
        // refreshes a renamed handle; any other account holding an active link on this external id
        // is the attribution hole above.
        if (row.accountIdentity.isEqual(accountIdentity)) {
            if (externalHandle !== undefined && externalHandle !== row.externalHandle) {
                ctx.db.linked_integration.id.update({...row, externalHandle});
            }
            return;
        }
        if (SHARED_EXTERNAL_PROVIDERS.has(provider)) continue;
        throw new SenderError(CraftError.EXTERNAL_ACCOUNT_ALREADY_LINKED);
    }

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
        if (row.provider === 'stelo') removeSteloWallet(ctx, id);
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
            candidateAddress: undefined,
            pendingReason: undefined,
            unverified: false,
            matchedUsername: undefined,
            confirmed: false,
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
            candidateAddress: undefined,
            pendingReason: undefined,
            unverified: false,
            matchedUsername: undefined,
            confirmed: false,
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
        // A `stelo` link only ever finalizes on the wallet the browser submitted, so the bot can't be
        // steered (or a browser skip the bot's verification) onto a different account.
        if (request.provider === 'stelo' && request.candidateAddress !== externalHandle) {
            throw new SenderError(CraftError.LINK_CANDIDATE_MISMATCH);
        }
        // A match the bot is waiting on the browser to confirm cannot finalize before it does.
        if (request.provider === 'stelo' && request.pendingReason === 'confirm-unverified' && !request.confirmed) {
            throw new SenderError(CraftError.LINK_NOT_CONFIRMED);
        }
        tryFinalizeIntegrationLink(ctx, {...request, externalId, externalHandle});
    }
);

/**
 * Browser side of a `stelo` link: names the Stelo account address (`#ABCD`, normalized here) the caller
 * says they control. Writes only `candidateAddress`, never `externalId`, so nothing finalizes until
 * `brico-bot` resolves and verifies it and calls `noteIntegrationLinkExternal`. `unverified` lets the
 * bot link an account it cannot verify ownership of, after the caller confirms the match it found;
 * such a wallet can receive payouts but never fund bounties.
 */
export const submitIntegrationLinkCandidate = spacetimedb.reducer(
    {code: t.string(), candidate: t.string(), unverified: t.bool()},
    (ctx, {code, candidate, unverified}) => {
        requireAccount(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        const address = normalizeSteloAddress(candidate);
        if (request.provider !== 'stelo' || request.accountIdentity === undefined || !request.accountIdentity.isEqual(ctx.sender)
            || request.externalId !== undefined || address === null) {
            throw new SenderError(CraftError.INVALID_LINK_CANDIDATE);
        }
        ctx.db.integration_link_request.id.update({
            ...request, candidateAddress: address, pendingReason: undefined, unverified, matchedUsername: undefined, confirmed: false,
        });
    }
);

/** Browser side of an unverified `stelo` link: accepts the account the bot matched, which lets the bot finalize. */
export const confirmIntegrationLinkCandidate = spacetimedb.reducer(
    {code: t.string()},
    (ctx, {code}) => {
        requireAccount(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        if (request.provider !== 'stelo' || request.accountIdentity === undefined || !request.accountIdentity.isEqual(ctx.sender)
            || request.externalId !== undefined || !request.unverified || request.pendingReason !== 'confirm-unverified') {
            throw new SenderError(CraftError.INVALID_LINK_CANDIDATE);
        }
        ctx.db.integration_link_request.id.update({...request, confirmed: true});
    }
);

/** Deletes the caller's own unresolved link request so the browser can abandon a waiting one. No-op if it is gone or already resolved. */
export const cancelIntegrationLinkRequest = spacetimedb.reducer(
    {code: t.string()},
    (ctx, {code}) => {
        requireAccount(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) return;
        if (request.accountIdentity === undefined || !request.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        }
        if (request.externalId !== undefined) return;
        ctx.db.integration_link_request.id.delete(request.id);
    }
);

/**
 * Service-principal-only: records why a `stelo` request isn't verified yet, and for an unverified
 * link the matched account's username. Writes only when something changes.
 */
export const noteIntegrationLinkStatus = spacetimedb.reducer(
    {code: t.string(), reason: t.string(), matchedUsername: t.option(t.string())},
    (ctx, {code, reason, matchedUsername}) => {
        requireServicePrincipal(ctx);
        const request = ctx.db.integration_link_request.code.find(code);
        if (request === null) throw new SenderError(CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED);
        if (request.pendingReason === reason && request.matchedUsername === matchedUsername) return;
        ctx.db.integration_link_request.id.update({...request, pendingReason: reason, matchedUsername});
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
