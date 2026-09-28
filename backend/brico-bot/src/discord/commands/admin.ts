/**
 * admin.ts — `/command-mode <flat|grouped>`: lets a server admin switch this guild between top-level
 * commands and everything nested under `/brico`, re-registering the guild's commands immediately.
 * Guild-only (`scope: "guild"`); the DM check in the handler only narrows the context type.
 */
import {DISCORD_COMMAND_MODE_LABELS, DISCORD_COMMAND_MODES, isDiscordCommandMode} from "@brico/crafts/discord-guild";
import type {APIChatInputApplicationCommandInteraction} from "discord-api-types/v10";
import {ApplicationCommandOptionType} from "discord-api-types/v10";

import {timeReducerCall} from "../../metrics.ts";
import {registerGuildCommands} from "../register-guild-commands.ts";
import {isCommandReply, requireInteractionContext, requirePermission} from "./context.ts";
import {leafOptions, stringOption} from "./options.ts";
import type {CommandDeps, CommandReply, LeafCommand} from "./registry.ts";

const MODE_OPTION_NAME = "mode";

async function handleCommandMode(interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    if (ctx.kind === "dm") return {content: "Run this in a server, not a DM — command layout is a per-server setting."};

    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;

    const mode = stringOption(leafOptions(interaction), MODE_OPTION_NAME);
    if (!mode || !isDiscordCommandMode(mode)) return {content: "Pick flat or grouped."};

    try {
        await timeReducerCall("upsert_discord_guild_install", ctx.conn.reducers.upsertDiscordGuildInstall({guildId: ctx.guildId, commandMode: mode}));
        await registerGuildCommands(deps.rest, deps.applicationId, ctx.guildId, mode);
    } catch (cause) {
        deps.log.warn("command-mode switch failed", {guildId: ctx.guildId, mode, error: cause instanceof Error ? cause.message : String(cause)});
        return {content: "Couldn't switch command layout — try again in a moment."};
    }

    return {
        content: mode === "grouped"
            ? "Commands are now grouped under `/brico` (e.g. `/brico link`, `/brico watch display`)."
            : "Commands are now top-level (e.g. `/link`, `/watch display`).",
    };
}

export const commandModeCommand: LeafCommand = {
    path: ["command-mode"],
    description: "Choose how brico's commands are organized in this server (admin only).",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: MODE_OPTION_NAME,
            description: "flat (top-level commands) or grouped (under /brico)",
            required: true,
            choices: DISCORD_COMMAND_MODES.map(value => ({name: DISCORD_COMMAND_MODE_LABELS[value], value})),
        },
    ],
    scope: "guild",
    handler: handleCommandMode,
};
