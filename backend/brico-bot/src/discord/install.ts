/**
 * install.ts — authorize URL and code exchange for the self-serve "add brico to your server" flow
 * (the callback route itself lives in `http-server.ts`).
 */
import {PermissionFlagsBits} from "discord-api-types/v10";

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

/** Enough to post the watch-display and notification messages. */
const INSTALL_PERMISSIONS = (
    PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks
).toString();

export function buildDiscordInstallAuthorizeUrl(options: {applicationId: string; redirectUri: string}): string {
    const url = new URL(DISCORD_AUTHORIZE_URL);
    url.searchParams.set("client_id", options.applicationId);
    url.searchParams.set("scope", "bot applications.commands");
    url.searchParams.set("permissions", INSTALL_PERMISSIONS);
    url.searchParams.set("redirect_uri", options.redirectUri);
    url.searchParams.set("response_type", "code");
    return url.toString();
}

/**
 * Exchanges the callback's `code` for the guild Discord actually granted; the callback's `guild_id`
 * query param is forgeable and must not be used. `redirectUri` must match the authorize request's.
 */
export async function resolveInstalledGuildId(options: {applicationId: string; clientSecret: string; redirectUri: string; code: string}): Promise<string> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: options.code,
        redirect_uri: options.redirectUri,
        client_id: options.applicationId,
        client_secret: options.clientSecret,
    });
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: body.toString(),
    });
    if (!tokenRes.ok) {
        throw new Error(`Discord token exchange failed: HTTP ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const token = (await tokenRes.json()) as {guild?: {id?: string}};
    const guildId = token.guild?.id;
    if (!guildId) throw new Error("token exchange response carried no guild id");
    return guildId;
}
