/**
 * discord-oauth.ts — the OAuth-handshake variant of Discord account linking, for a user who logged
 * into brico a way other than Discord. (A user who *did* log in via Discord never needs this route —
 * the module's `linkDiscordViaSpacetimeAuth` shortcut covers that case directly.)
 *
 * Plain OAuth2 (Discord's own docs: https://discord.com/developers/docs/topics/oauth2), not OIDC —
 * there is no ID token here, just an access token used once against `/users/@me` to read the
 * snowflake and username, structurally identical to what BitAuth's `sub`/`preferred_username`
 * provide. No PKCE: this is a confidential client (client_secret held server-side here), same as
 * BitAuth's, and Discord's authorization-code flow does not require it for that client type.
 */
const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";

export interface DiscordOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface DiscordIdentity {
    /** The Discord snowflake — stable, this is the `externalId`. */
    id: string;
    /** Display name — mutable, this is the `externalHandle`. */
    username: string;
}

export interface DiscordOAuthClient {
    buildAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<DiscordIdentity>;
}

export function createDiscordOAuthClient(config: DiscordOAuthConfig): DiscordOAuthClient {
    return {
        buildAuthorizeUrl(state) {
            const url = new URL(DISCORD_AUTHORIZE_URL);
            url.searchParams.set("response_type", "code");
            url.searchParams.set("client_id", config.clientId);
            url.searchParams.set("redirect_uri", config.redirectUri);
            url.searchParams.set("scope", "identify");
            url.searchParams.set("state", state);
            return url.toString();
        },

        async exchangeCode(code) {
            const body = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: config.redirectUri,
                client_id: config.clientId,
                client_secret: config.clientSecret,
            });
            const tokenRes = await fetch(DISCORD_TOKEN_URL, {
                method: "POST",
                headers: {"content-type": "application/x-www-form-urlencoded"},
                body: body.toString(),
            });
            if (!tokenRes.ok) {
                throw new Error(`Discord token exchange failed: HTTP ${tokenRes.status} ${await tokenRes.text()}`);
            }
            const tokens = (await tokenRes.json()) as {access_token: string};

            const meRes = await fetch(DISCORD_ME_URL, {
                headers: {authorization: `Bearer ${tokens.access_token}`},
            });
            if (!meRes.ok) throw new Error(`Discord /users/@me failed: HTTP ${meRes.status}`);
            const me = (await meRes.json()) as {id: string; username: string};
            return {id: me.id, username: me.username};
        },
    };
}
