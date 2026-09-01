/**
 * oidc-client.ts — a minimal Authorization Code + PKCE (S256) relying-party client against any
 * spec-compliant OIDC issuer, used for BitAuth (`https://auth.trinit.is`).
 *
 * Deliberately generic rather than hardcoding BitAuth's `/connect/*` paths: those are that specific
 * issuer's routes, but OIDC discovery (`/.well-known/openid-configuration`) is the standard way to
 * find them, and BitAuth's own docs confirm it exposes one. Discovery is cached in memory for the
 * process lifetime — an issuer's endpoints don't move without a coordinated migration.
 */
import {createRemoteJWKSet, jwtVerify} from "jose";

interface OidcDiscovery {
    /** The issuer's own canonical self-identification — not necessarily byte-identical to the
     * configured base URL (BitAuth's discovery document declares `https://auth.trinit.is/`, with a
     * trailing slash, verified against its live `/.well-known/openid-configuration`). This is what
     * must be checked against an ID token's `iss` claim, never the configured value — see below. */
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
}

export interface OidcClientConfig {
    /** Base URL discovery is fetched from (`<issuer>/.well-known/openid-configuration`), e.g.
     * `https://auth.trinit.is` — need not exactly match the `issuer` an ID token actually carries;
     * that value is read from the discovery document itself (see `OidcDiscovery.issuer`), never
     * from this config, since the two can differ by a trailing slash. */
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    /** Space-separated, e.g. `openid profile`. */
    scope: string;
}

export interface OidcVerifiedIdentity {
    sub: string;
    /** Full ID-token claim set, so a caller can read a provider-specific display-name claim. */
    claims: Record<string, unknown>;
}

export interface OidcClient {
    buildAuthorizeUrl(state: string, codeChallenge: string): Promise<string>;
    /** Exchanges an authorization code, validates the ID token's signature/issuer/audience against
     * the issuer's live JWKS, and returns its claims. Throws on any failure — a link with an
     * unverified identity is worse than no link. */
    exchangeCode(code: string, codeVerifier: string): Promise<OidcVerifiedIdentity>;
}

export function createOidcClient(config: OidcClientConfig): OidcClient {
    let discovery: Promise<OidcDiscovery> | null = null;
    let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

    function discover(): Promise<OidcDiscovery> {
        if (discovery === null) {
            discovery = fetch(`${config.issuer}/.well-known/openid-configuration`).then(async res => {
                if (!res.ok) throw new Error(`OIDC discovery failed for ${config.issuer}: HTTP ${res.status}`);
                return await res.json() as Promise<OidcDiscovery>;
            });
        }
        return discovery;
    }

    return {
        async buildAuthorizeUrl(state, codeChallenge) {
            const {authorization_endpoint} = await discover();
            const url = new URL(authorization_endpoint);
            url.searchParams.set("response_type", "code");
            url.searchParams.set("client_id", config.clientId);
            url.searchParams.set("redirect_uri", config.redirectUri);
            url.searchParams.set("scope", config.scope);
            url.searchParams.set("state", state);
            url.searchParams.set("code_challenge", codeChallenge);
            url.searchParams.set("code_challenge_method", "S256");
            return url.toString();
        },

        async exchangeCode(code, codeVerifier) {
            const {issuer, token_endpoint, jwks_uri} = await discover();
            const body = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: config.redirectUri,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code_verifier: codeVerifier,
            });
            const tokenRes = await fetch(token_endpoint, {
                method: "POST",
                headers: {"content-type": "application/x-www-form-urlencoded"},
                body: body.toString(),
            });
            if (!tokenRes.ok) {
                throw new Error(`BitAuth token exchange failed: HTTP ${tokenRes.status} ${await tokenRes.text()}`);
            }
            const tokens = (await tokenRes.json()) as {id_token?: string};
            if (!tokens.id_token) throw new Error("BitAuth token response had no id_token");

            if (jwks === null) jwks = createRemoteJWKSet(new URL(jwks_uri));
            const {payload} = await jwtVerify(tokens.id_token, jwks, {
                issuer,
                audience: config.clientId,
            });
            if (typeof payload.sub !== "string" || payload.sub === "") {
                throw new Error("BitAuth id_token is missing sub");
            }
            return {sub: payload.sub, claims: payload as Record<string, unknown>};
        },
    };
}
