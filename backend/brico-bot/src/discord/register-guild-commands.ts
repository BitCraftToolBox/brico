/** register-guild-commands.ts — PUTs a guild's command tree (or the global DM-only set); shared by the CLI script, install callback, `/command-mode` and startup resync. */
import type {DiscordCommandMode} from "@brico/crafts/discord-guild";
import type {REST} from "@discordjs/rest";
import {ApplicationIntegrationType, InteractionContextType, Routes} from "discord-api-types/v10";

import {commands} from "./commands";
import {buildCommandTree, leavesForScope} from "./commands/registry.ts";

export async function registerGuildCommands(rest: REST, applicationId: string, guildId: string, mode: DiscordCommandMode): Promise<void> {
    const body = buildCommandTree(leavesForScope(commands, "guild"), mode);
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {body});
}

/** Registers the DM-scoped commands globally, flat and `BotDM`-only (guild commands are registered per guild). */
export async function registerGlobalCommands(rest: REST, applicationId: string): Promise<void> {
    const body = buildCommandTree(leavesForScope(commands, "dm"), "flat").map(command => ({
        ...command,
        contexts: [InteractionContextType.BotDM],
        integration_types: [ApplicationIntegrationType.GuildInstall],
    }));
    await rest.put(Routes.applicationCommands(applicationId), {body});
}
