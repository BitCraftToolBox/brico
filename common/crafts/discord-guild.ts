/** Valid values of `discord_guild_install.commandMode`, shared by the module (validation) and the bot's command registry. */

export const DISCORD_COMMAND_MODES = ["flat", "grouped"] as const;
export type DiscordCommandMode = (typeof DISCORD_COMMAND_MODES)[number];

export function isDiscordCommandMode(value: string): value is DiscordCommandMode {
    return (DISCORD_COMMAND_MODES as readonly string[]).includes(value);
}

export const DISCORD_COMMAND_MODE_LABELS: Record<DiscordCommandMode, string> = {
    flat: "Flat (top-level commands, e.g. /link)",
    grouped: "Grouped (under /brico, e.g. /brico link)",
};
