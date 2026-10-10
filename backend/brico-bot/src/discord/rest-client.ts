/**
 * rest-client.ts — the shared `@discordjs/rest` client (it queues requests per rate-limit bucket).
 * The bot has no gateway connection; everything is REST.
 */
import {REST} from "@discordjs/rest";

export function createDiscordRestClient(token: string): REST {
    return new REST({version: "10"}).setToken(token);
}
