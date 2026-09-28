/**
 * watch-display-options.ts — `/watch display-limit` and `/watch display-sticky`: change `limit` /
 * `stickyMinutes` on an existing display (the setup modal has no fields for them). Siblings of
 * `/watch display` rather than children, since a name can't be both a bare subcommand and a group.
 * Only edits an existing `discord_watch_display` row; it never creates one.
 */
import {MAX_DISPLAY_ROWS_HARD_CAP, MAX_STICKY_MINUTES, MIN_STICKY_MINUTES} from "@brico/crafts/discord-display";
import type {APIChatInputApplicationCommandInteraction} from "discord-api-types/v10";
import {ApplicationCommandOptionType} from "discord-api-types/v10";

import {timeReducerCall} from "../../metrics.ts";
import {discordUserIdFor, isCommandReply, requireInteractionContext, requireLinkedAccount, requirePermission} from "./context.ts";
import {integerOption, leafOptions, stringOption} from "./options.ts";
import type {CommandDeps, CommandHandler, CommandReply, LeafCommand} from "./registry.ts";
import {findExistingDisplay, ownSavedFilters, watchDisplayFilterAutocomplete} from "./watch.ts";

const FILTER_OPTION_NAME = "filter";

interface WatchDisplayOptionSpec {
    path: string[];
    commandDescription: string;
    optionName: string;
    optionDescription: string;
    field: "limit" | "stickyMinutes";
    minValue: number;
    maxValue: number;
    formatSuccess(filterName: string, value: number): string;
}

function makeWatchDisplayOptionCommand(spec: WatchDisplayOptionSpec): LeafCommand {
    const handler: CommandHandler = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> => {
        const ctx = requireInteractionContext(interaction, deps);
        if (isCommandReply(ctx)) return ctx;
        const permissionError = requirePermission(ctx);
        if (permissionError) return permissionError;
        const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
        if (isCommandReply(accountIdentity)) return accountIdentity;
        const {conn, channelId} = ctx;

        const options = leafOptions(interaction);
        const filterId = stringOption(options, FILTER_OPTION_NAME);
        const value = integerOption(options, spec.optionName);
        if (!filterId || value === undefined) return {content: "Choose a filter and a value."};

        const filter = [...ownSavedFilters(conn, accountIdentity)].find(saved => saved.id === filterId);
        if (!filter) return {content: "That filter is no longer available — pick it again."};

        const existing = findExistingDisplay(conn, accountIdentity, filterId, channelId);
        if (!existing) return {content: `There's no watch display for "${filter.name}" in this channel yet — run \`/watch display\` first.`};

        try {
            await timeReducerCall("attach_discord_watch_display", conn.reducers.attachDiscordWatchDisplay({
                id: existing.id,
                accountIdentity,
                filterId: existing.filterId,
                channelId: existing.channelId,
                content: existing.content,
                style: existing.style,
                sortField: existing.sortField,
                sortDirection: existing.sortDirection,
                limit: spec.field === "limit" ? value : existing.limit,
                stickyMinutes: spec.field === "stickyMinutes" ? value : existing.stickyMinutes,
                refreshIntervalSeconds: existing.refreshIntervalSeconds,
                shareCode: existing.shareCode,
            }));
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            deps.log.warn("attach_discord_watch_display failed", {error: message});
            return {content: `Couldn't update that: ${message}`};
        }

        return {content: spec.formatSuccess(filter.name, value)};
    };

    return {
        path: spec.path,
        description: spec.commandDescription,
        options: [
            {
                type: ApplicationCommandOptionType.String,
                name: FILTER_OPTION_NAME,
                description: "Which watch display to edit (by its saved filter).",
                required: true,
                autocomplete: true,
            },
            {
                type: ApplicationCommandOptionType.Integer,
                name: spec.optionName,
                description: spec.optionDescription,
                required: true,
                min_value: spec.minValue,
                max_value: spec.maxValue,
            },
        ],
        handler,
        autocomplete: watchDisplayFilterAutocomplete,
    };
}

export const watchDisplayLimitCommand: LeafCommand = makeWatchDisplayOptionCommand({
    path: ["watch", "display-limit"],
    commandDescription: "Change how many crafts a watch display shows at once.",
    optionName: "cap",
    optionDescription: "Maximum number of crafts to show.",
    field: "limit",
    minValue: 1,
    maxValue: MAX_DISPLAY_ROWS_HARD_CAP,
    formatSuccess: (filterName, value) => `Watch display for "${filterName}" now shows up to ${value} craft${value === 1 ? "" : "s"}.`,
});

export const watchDisplayStickyCommand: LeafCommand = makeWatchDisplayOptionCommand({
    path: ["watch", "display-sticky"],
    commandDescription: "Change how often a watch display reposts itself to stay at the bottom of the channel.",
    optionName: "minutes",
    optionDescription: "Minutes between reposts (0 disables reposting).",
    field: "stickyMinutes",
    minValue: MIN_STICKY_MINUTES,
    maxValue: MAX_STICKY_MINUTES,
    formatSuccess: (filterName, value) =>
        value === 0
            ? `Watch display for "${filterName}" no longer reposts itself.`
            : `Watch display for "${filterName}" now reposts itself every ${value} minute${value === 1 ? "" : "s"}.`,
});
