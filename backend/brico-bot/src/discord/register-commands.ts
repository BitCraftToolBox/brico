/**
 * register-commands.ts — manual script (`npm run discord:register-commands --workspace @brico/bot -- <flags>`)
 * that PUTs the command tree to a guild or, with `--global`, the DM-only set. A PUT bulk-overwrites
 * the scope, so it removes any command not in the tree.
 *
 * Flags: `--guild <id>` (default `DISCORD_TEST_GUILD_ID`), `--mode flat|grouped` (default `flat`;
 * `grouped` nests everything under `/brico`; ignored with `--global`), `--global`, `--clear` (PUT an
 * empty list; `--clear --global` removes leftover global commands).
 *
 * Global commands are limited to `contexts: [BotDM]`; otherwise they would also appear in every
 * guild alongside that guild's own registration.
 */
import {REST} from "@discordjs/rest";
import {Routes} from "discord-api-types/v10";

import {loadConfig, loadEnvFile} from "../config.ts";
import {commands} from "./commands/index.ts";
import {buildCommandTree, type CommandTreeMode, leavesForScope} from "./commands/registry.ts";
import {registerGlobalCommands, registerGuildCommands} from "./register-guild-commands.ts";

interface Args {
    mode: CommandTreeMode;
    guildId: string | undefined;
    global: boolean;
    clear: boolean;
}

function parseArgs(argv: string[]): Args {
    let mode: CommandTreeMode = "flat";
    let guildId: string | undefined;
    let global = false;
    let clear = false;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--mode" && argv[i + 1]) {
            const value = argv[++i];
            if (value !== "flat" && value !== "grouped") throw new Error(`--mode must be "flat" or "grouped", got ${JSON.stringify(value)}`);
            mode = value;
        } else if (argv[i] === "--guild" && argv[i + 1]) {
            guildId = argv[++i];
        } else if (argv[i] === "--global") {
            global = true;
        } else if (argv[i] === "--clear") {
            clear = true;
        }
    }
    return {mode, guildId, global, clear};
}

async function main(): Promise<void> {
    loadEnvFile();
    const discordBot = loadConfig().discordBot;
    if (!discordBot) {
        throw new Error("DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, and DISCORD_APPLICATION_ID must all be set");
    }

    const {mode, guildId: guildIdArg, global, clear} = parseArgs(process.argv.slice(2));
    const rest = new REST({version: "10"}).setToken(discordBot.token);

    if (global) {
        // Global registration is always flat and DM-only (see `registerGlobalCommands`).
        if (clear) {
            console.log("clearing all global commands");
            await rest.put(Routes.applicationCommands(discordBot.applicationId), {body: []});
        } else {
            const dmCommands = leavesForScope(commands, "dm");
            console.log(`registering ${dmCommands.length} DM-only command(s) globally:`, dmCommands.map(c => c.path.join(".")));
            await registerGlobalCommands(rest, discordBot.applicationId);
        }
        console.log("done — global command changes can take up to an hour to propagate everywhere");
        return;
    }

    const guildId = guildIdArg ?? discordBot.testGuildId;
    if (!guildId) throw new Error("pass --guild <id> or set DISCORD_TEST_GUILD_ID");

    if (clear) {
        console.log(`clearing all commands in guild ${guildId}`);
        await rest.put(Routes.applicationGuildCommands(discordBot.applicationId, guildId), {body: []});
    } else {
        const body = buildCommandTree(leavesForScope(commands, "guild"), mode);
        console.log(`registering ${body.length} command(s) to guild ${guildId} (mode=${mode}):`, body.map(c => c.name));
        await registerGuildCommands(rest, discordBot.applicationId, guildId, mode);
    }
    console.log("done");
}

main().catch(cause => {
    console.error(cause);
    process.exit(1);
});
