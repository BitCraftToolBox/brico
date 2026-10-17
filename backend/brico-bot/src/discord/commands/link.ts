/**
 * link.ts — `/link`: starts bot-initiated Discord account linking via
 * `beginIntegrationLinkForExternal` and replies with a redemption URL for the web app. Works in a
 * guild or DM with no permission check.
 */
import type {APIChatInputApplicationCommandInteraction} from "discord-api-types/v10";
import {randomUUID} from "node:crypto";

import {timeReducerCall} from "../../metrics.ts";
import {discordUserFor, isCommandReply, requireInteractionContext} from "./context.ts";
import type {CommandDeps, CommandReply, LeafCommand} from "./registry.ts";

async function handleLink(interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const {conn} = ctx;
    const discordUser = discordUserFor(ctx);

    const code = randomUUID();
    try {
        await timeReducerCall("begin_integration_link_for_external", conn.reducers.beginIntegrationLinkForExternal({
            code,
            provider: "discord",
            externalId: discordUser.id,
            externalHandle: discordUser.username,
        }));
    } catch (cause) {
        deps.log.warn("begin_integration_link_for_external failed", {
            discordUserId: discordUser.id,
            error: cause instanceof Error ? cause.message : String(cause),
        });
        return {content: "Couldn't start the link — try again in a moment."};
    }

    const redemptionUrl = `${new URL(deps.linkReturnUrl).origin}/account/link?code=${code}`;
    return {
        content:
            `Open this link while signed in to Brico.app to finish linking your Discord account:\n<${redemptionUrl}>\n\n` +
            "This link expires in 15 minutes.",
    };
}

export const linkCommand: LeafCommand = {
    path: ["link"],
    description: "Link your Discord account to your Brico.app account.",
    handler: handleLink,
};
