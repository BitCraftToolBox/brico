/**
 * options.ts — reads argument values from a chat-input or autocomplete interaction.
 */
import type {APIApplicationCommandInteractionDataOption, APIRole, APIUser} from "discord-api-types/v10";
import {ApplicationCommandOptionType} from "discord-api-types/v10";

import type {CommandLikeInteraction} from "./registry.ts";

/** The leaf's argument options, below any Subcommand/SubcommandGroup nesting. */
export function leafOptions(interaction: CommandLikeInteraction): readonly APIApplicationCommandInteractionDataOption[] {
    let options = interaction.data?.options;
    while (options && options.length === 1) {
        const [option] = options;
        if (option.type !== ApplicationCommandOptionType.Subcommand && option.type !== ApplicationCommandOptionType.SubcommandGroup) break;
        options = "options" in option ? option.options : undefined;
    }
    return options ?? [];
}

export function stringOption(options: readonly APIApplicationCommandInteractionDataOption[], name: string): string | undefined {
    const option = options.find(o => o.name === name);
    return option && option.type === ApplicationCommandOptionType.String ? option.value : undefined;
}

export function integerOption(options: readonly APIApplicationCommandInteractionDataOption[], name: string): number | undefined {
    const option = options.find(o => o.name === name);
    if (!option || option.type !== ApplicationCommandOptionType.Integer) return undefined;
    // Autocomplete interactions deliver integers as strings.
    return typeof option.value === "string" ? Number(option.value) : option.value;
}

/** The option being typed into during autocomplete; `undefined` otherwise. */
export function focusedOptionName(options: readonly APIApplicationCommandInteractionDataOption[]): string | undefined {
    return options.find(o => "focused" in o && o.focused)?.name;
}

/** A resolved `MENTIONABLE` option — either a user or a role, never both. */
export type ResolvedMentionable = {kind: "user"; user: APIUser} | {kind: "role"; role: APIRole};

/** A `MENTIONABLE` option's value is a snowflake; the user or role object comes from `data.resolved`. `undefined` if unset or unresolved. */
export function mentionableOption(interaction: CommandLikeInteraction, options: readonly APIApplicationCommandInteractionDataOption[], name: string): ResolvedMentionable | undefined {
    const option = options.find(o => o.name === name);
    if (!option || option.type !== ApplicationCommandOptionType.Mentionable) return undefined;
    const id = option.value;
    const resolved = interaction.data?.resolved;
    const user = resolved?.users?.[id];
    if (user) return {kind: "user", user};
    const role = resolved?.roles?.[id];
    if (role) return {kind: "role", role};
    return undefined;
}
