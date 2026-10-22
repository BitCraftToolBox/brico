/**
 * list-commands.ts — prints every registered Discord command leaf with its path and arguments
 * (`npm run discord:list-commands --workspace @brico/bot`), grouped by scope.
 */
import {ApplicationCommandOptionType} from "discord-api-types/v10";

import {commands} from "../src/discord/commands";
import type {LeafCommand} from "../src/discord/commands/registry";

const TYPE_NAMES: Partial<Record<ApplicationCommandOptionType, string>> = {
    [ApplicationCommandOptionType.String]: "string",
    [ApplicationCommandOptionType.Integer]: "integer",
    [ApplicationCommandOptionType.Boolean]: "boolean",
    [ApplicationCommandOptionType.User]: "user",
    [ApplicationCommandOptionType.Channel]: "channel",
    [ApplicationCommandOptionType.Role]: "role",
    [ApplicationCommandOptionType.Mentionable]: "mentionable",
    [ApplicationCommandOptionType.Number]: "number",
    [ApplicationCommandOptionType.Attachment]: "attachment",
};

function formatArg(option: NonNullable<LeafCommand["options"]>[number]): string {
    const choices = "choices" in option ? option.choices : undefined;
    const type = choices?.length ? choices.map(c => c.value).join("|") : TYPE_NAMES[option.type] ?? String(option.type);
    const text = `${option.name}: ${type}`;
    return option.required ? `<${text}>` : `[${text}]`;
}

function formatLeaf(leaf: LeafCommand): string {
    return ["/" + leaf.path.join(" "), ...(leaf.options ?? []).map(formatArg)].join(" ");
}

function printSection(heading: string | null, leaves: LeafCommand[]): void {
    if (leaves.length === 0) return;
    if (heading) console.log(`${heading}:`);
    for (const leaf of [...leaves].sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")))) {
        console.log(formatLeaf(leaf));
    }
}

printSection(null, commands.filter(leaf => leaf.scope === undefined));
printSection("guild only", commands.filter(leaf => leaf.scope === "guild"));
printSection("dm only", commands.filter(leaf => leaf.scope === "dm"));
