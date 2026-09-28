/**
 * clear.ts — `/clear`, deletes the bot's own messages in the DM it's run from (`scope: "dm"`).
 *
 * Bulk-delete is guild-only, so messages are deleted one at a time. That can exceed Discord's
 * 3-second interaction deadline, so the handler replies immediately and the sweep runs in the
 * background.
 */
import {DiscordAPIError} from "@discordjs/rest";
import type {APIChatInputApplicationCommandInteraction, APIMessage} from "discord-api-types/v10";
import {Routes} from "discord-api-types/v10";

import {isCommandReply, requireInteractionContext} from "./context.ts";
import type {CommandDeps, CommandReply, LeafCommand} from "./registry.ts";

const PAGE_SIZE = 100;

async function clearOwnMessages(channelId: string, deps: CommandDeps): Promise<number> {
    // A bot user's id is its application id.
    const botId = deps.applicationId;
    let deleted = 0;
    let before: string | undefined;
    for (;;) {
        const query = new URLSearchParams({limit: String(PAGE_SIZE)});
        if (before) query.set("before", before);
        const page = (await deps.rest.get(Routes.channelMessages(channelId), {query})) as APIMessage[];
        if (page.length === 0) break;

        for (const message of page) {
            if (message.author.id !== botId) continue;
            try {
                await deps.rest.delete(Routes.channelMessage(channelId, message.id));
                deleted++;
            } catch (cause) {
                // Already gone (e.g. a display repost raced us) — nothing to do.
                if (!(cause instanceof DiscordAPIError && cause.status === 404)) throw cause;
            }
        }
        // Pages come newest-first, so the last entry is the oldest.
        before = page[page.length - 1].id;
        if (page.length < PAGE_SIZE) break;
    }
    return deleted;
}

async function handleClear(interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    if (ctx.kind !== "dm") return {content: "This only works in a DM with the bot."};

    const {channelId} = ctx;
    void clearOwnMessages(channelId, deps).then(
        deleted => deps.log.info("cleared dm messages", {channelId, deleted}),
        cause => deps.log.warn("clearing dm messages failed", {channelId, error: cause instanceof Error ? cause.message : String(cause)}),
    );
    return {content: "Clearing my messages from this conversation…"};
}

export const clearCommand: LeafCommand = {
    path: ["clear"],
    description: "Delete the bot's messages in this DM.",
    scope: "dm",
    handler: handleClear,
};
