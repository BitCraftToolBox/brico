import {CraftError} from '@brico/crafts/errors';
import type {JwtClaims} from 'spacetimedb/server';
import {SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';

/**
 * SpacetimeDB's own OIDC provider. **Shared and multi-tenant** — every app that offers
 * SpacetimeAuth login gets ID tokens from this exact issuer URL, distinguished from each other
 * only by the `aud` claim (the registered client id).
 */
export const SPACETIMEAUTH_ISSUER = 'https://auth.spacetimedb.com/oidc';

/**
 * Brico's own registered SpacetimeAuth client id . Must mirror the frontend's
 * `CLIENT_ID` (`frontend/src/lib/account/oidc.ts`).
 */
export const SPACETIMEAUTH_CLIENT_ID = 'client_034GOTUp60ggtFOXkImWEk';

/**
 * Issuers whose tokens may provision or touch a brico account, checked by `requireTrustedJwt`
 * below. `localhost` is added specifically only with `publish:local`, not a default.
 */
const ACCEPTED_ISSUERS = [SPACETIMEAUTH_ISSUER];

/**
 * Validates and returns the caller's JWT claims.
 *
 * Any reducer that reads claims off `ctx.senderAuth.jwt` beyond `ctx.sender` itself (i.e. anything
 * from `fullPayload`, like `linkDiscordViaSpacetimeAuth`) must call this first, not just rely
 * on `ensureAccount` having checked it once: a session can *reconnect* with a different token that
 * still derives the same `Identity` (same `iss`+`sub`) but carries a different, unchecked `aud` —
 * `ensureAccount` passing once at account-creation time says nothing about what token the *current*
 * connection actually presented.
 */
export function requireTrustedJwt(ctx: Ctx): JwtClaims {
    const jwt = ctx.senderAuth.jwt;
    if (jwt === null) throw new SenderError(CraftError.NOT_OIDC_AUTHENTICATED);
    if (!ACCEPTED_ISSUERS.includes(jwt.issuer)) {
        throw new SenderError(`${CraftError.ISSUER_NOT_ACCEPTED}:${jwt.issuer}`);
    }
    if (jwt.issuer === SPACETIMEAUTH_ISSUER && !jwt.audience.includes(SPACETIMEAUTH_CLIENT_ID)) {
        throw new SenderError(`${CraftError.AUDIENCE_NOT_ACCEPTED}:${jwt.audience.join(',')}`);
    }
    return jwt;
}

export function requireServicePrincipal(ctx: Ctx): void {
    if (ctx.db.service_principal.identity.find(ctx.sender) === null) {
        throw new SenderError(CraftError.NOT_SERVICE_PRINCIPAL);
    }
}

export function requireAccount(ctx: Ctx) {
    const row = ctx.db.account.identity.find(ctx.sender);
    if (row === null) throw new SenderError(CraftError.NO_BRICO_ACCOUNT);
    return row;
}
