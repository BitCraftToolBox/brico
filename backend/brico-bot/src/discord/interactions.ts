/** interactions.ts — handler for `POST /discord/interactions`, the HTTP transport for all slash commands (no gateway). */
import type {
    APIApplicationCommandAutocompleteInteraction,
    APIChatInputApplicationCommandInteraction,
    APIInteraction,
    APIInteractionResponse,
    APIModalSubmitInteraction
} from "discord-api-types/v10";
import {InteractionResponseType, InteractionType, MessageFlags} from "discord-api-types/v10";
import {verifyKey} from "discord-interactions";
import type {IncomingMessage, ServerResponse} from "node:http";

import type {Logger} from "../log.ts";
import {commandInvocationsTotal} from "../metrics.ts";
import type {CommandDeps, LeafCommand} from "./commands/registry.ts";
import {resolveCommand, resolveModalLeaf} from "./commands/registry.ts";

export interface InteractionsHandlerOptions {
    /** Ed25519 public key from the Discord Developer Portal — every request is signed against this. */
    publicKey: string;
    leaves: LeafCommand[];
    /** Group command name used by "grouped" mode; stripped when resolving (see `resolveCommand`). */
    groupName?: string;
    deps: CommandDeps;
    log: Logger;
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

function sendJson(res: ServerResponse, status: number, body: APIInteractionResponse | {error: string}): void {
    const json = JSON.stringify(body);
    res.writeHead(status, {"content-type": "application/json"});
    res.end(json);
}

function messageResponse(content: string, ephemeral: boolean): APIInteractionResponse {
    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {content, flags: ephemeral ? MessageFlags.Ephemeral : undefined},
    };
}

/**
 * Verifies the Ed25519 signature over the raw body (before JSON parsing), answers Discord's `PING`
 * (required to save the endpoint URL), and otherwise dispatches to the matching command leaf.
 */
export function createInteractionsHandler(options: InteractionsHandlerOptions) {
    return async function handleInteractions(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const signature = req.headers["x-signature-ed25519"];
        const timestamp = req.headers["x-signature-timestamp"];
        if (typeof signature !== "string" || typeof timestamp !== "string") {
            res.writeHead(401);
            res.end("missing signature headers");
            return;
        }

        const rawBody = await readRawBody(req);
        const validSignature = await verifyKey(rawBody, signature, timestamp, options.publicKey);
        if (!validSignature) {
            res.writeHead(401);
            res.end("invalid request signature");
            return;
        }

        let interaction: APIInteraction;
        try {
            interaction = JSON.parse(rawBody.toString("utf8"));
        } catch {
            res.writeHead(400);
            res.end("invalid JSON");
            return;
        }

        if (interaction.type === InteractionType.Ping) {
            sendJson(res, 200, {type: InteractionResponseType.Pong});
            return;
        }

        if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
            const autocompleteInteraction = interaction as APIApplicationCommandAutocompleteInteraction;
            const command = resolveCommand(options.leaves, autocompleteInteraction, options.groupName);
            if (!command?.autocomplete) {
                sendJson(res, 200, {type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: {choices: []}});
                return;
            }
            try {
                const choices = await command.autocomplete(autocompleteInteraction, options.deps);
                sendJson(res, 200, {type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: {choices}});
            } catch (cause) {
                options.log.error("autocomplete handler threw", {
                    command: command.path.join("."),
                    error: cause instanceof Error ? cause.message : String(cause),
                });
                sendJson(res, 200, {type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: {choices: []}});
            }
            return;
        }

        if (interaction.type === InteractionType.ModalSubmit) {
            const modalInteraction = interaction as APIModalSubmitInteraction;
            const command = resolveModalLeaf(options.leaves, modalInteraction.data.custom_id);
            if (!command?.modalSubmit) {
                options.log.warn("unrecognized modal submission", {customId: modalInteraction.data.custom_id});
                sendJson(res, 200, messageResponse("Unrecognized modal.", true));
                return;
            }
            try {
                const reply = await command.modalSubmit(modalInteraction, options.deps);
                sendJson(res, 200, messageResponse(reply.content, reply.ephemeral ?? true));
            } catch (cause) {
                options.log.error("modal submit handler threw", {
                    command: command.path.join("."),
                    error: cause instanceof Error ? cause.message : String(cause),
                });
                sendJson(res, 200, messageResponse("Something went wrong finishing that setup.", true));
            }
            return;
        }

        if (interaction.type !== InteractionType.ApplicationCommand) {
            // No component handlers are registered.
            options.log.warn("unhandled interaction type", {type: interaction.type});
            sendJson(res, 200, messageResponse("This interaction type isn't supported yet.", true));
            return;
        }

        const commandInteraction = interaction as APIChatInputApplicationCommandInteraction;
        const command = resolveCommand(options.leaves, commandInteraction, options.groupName);
        if (!command) {
            options.log.warn("unrecognized command interaction", {name: commandInteraction.data?.name});
            sendJson(res, 200, messageResponse("Unrecognized command.", true));
            return;
        }

        let status: string = "";
        try {
            const result = await command.handler(commandInteraction, options.deps);
            if ("modal" in result) {
                sendJson(res, 200, {type: InteractionResponseType.Modal, data: result.modal});
            } else {
                sendJson(res, 200, messageResponse(result.content, result.ephemeral ?? true));
            }
            status = "ok";
        } catch (cause) {
            options.log.error("command handler threw", {
                command: command.path.join("."),
                error: cause instanceof Error ? cause.message : String(cause),
            });
            sendJson(res, 200, messageResponse("Something went wrong running that command.", true));
            status = "error";
        } finally {
            commandInvocationsTotal.inc({
                command: command.path.join("."),
                context: commandInteraction.guild_id ? "guild" : "dm",
                result: status
            });
        }
    };
}
