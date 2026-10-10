/**
 * sync-guild-commands.ts — re-registers commands for every guild the bot is currently in (listed via
 * `GET /users/@me/guilds`, so removed guilds are skipped) plus the global DM-only set. Runs at
 * startup so deploys reach already-installed guilds. A guild without a `discord_guild_install` row
 * (invited manually) gets `"flat"`.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import {isDiscordCommandMode} from "@brico/crafts/discord-guild";
import type {REST} from "@discordjs/rest";
import {Routes} from "discord-api-types/v10";

import type {Logger} from "../log.ts";
import {registerGlobalCommands, registerGuildCommands} from "./register-guild-commands.ts";

/** Max page size for `GET /users/@me/guilds`. */
const GUILDS_PAGE_SIZE = 200;

async function listCurrentGuildIds(rest: REST): Promise<string[]> {
    const ids: string[] = [];
    let after: string | undefined;
    for (;;) {
        const query = new URLSearchParams({limit: String(GUILDS_PAGE_SIZE)});
        if (after) query.set("after", after);
        const page = (await rest.get(Routes.userGuilds(), {query})) as {id: string}[];
        for (const guild of page) ids.push(guild.id);
        if (page.length < GUILDS_PAGE_SIZE) break;
        after = page[page.length - 1].id;
    }
    return ids;
}

export async function syncAllGuildCommands(options: {rest: REST; applicationId: string; conn: DbConnection; log: Logger}): Promise<void> {
    const {rest, applicationId, conn, log} = options;

    const modeByGuildId = new Map<string, string>();
    for (const row of conn.db.allDiscordGuildInstall.iter()) modeByGuildId.set(row.guildId, row.commandMode);

    const guildIds = await listCurrentGuildIds(rest);
    log.info("resyncing guild commands", {guilds: guildIds.length});

    for (const guildId of guildIds) {
        const stored = modeByGuildId.get(guildId);
        const mode = stored && isDiscordCommandMode(stored) ? stored : "flat";
        try {
            await registerGuildCommands(rest, applicationId, guildId, mode);
        } catch (cause) {
            log.warn("guild command resync failed for one guild — continuing with the rest", {
                guildId,
                error: cause instanceof Error ? cause.message : String(cause),
            });
        }
    }

    try {
        await registerGlobalCommands(rest, applicationId);
        log.info("synced global commands. may take time to show up.")
    } catch (cause) {
        log.warn("global command resync failed", {error: cause instanceof Error ? cause.message : String(cause)});
    }
}
