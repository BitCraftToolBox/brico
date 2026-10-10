/**
 * funding.ts — `/watch funding-setup`: sets the mention and wording of Stelo funding alerts for the
 * Discord channel it is run in. The channel must already be linked with `/watch notify-link`.
 *
 * Per-event on/off is derived server-side by `attachDiscordFundingTarget` from whether each template
 * field was left empty.
 */
import type {DiscordFundingNotifyTarget, DiscordNotifySink} from "@brico/bindings/brico-app/types";
import {MAX_NOTIFY_TEMPLATE_LENGTH} from "@brico/crafts/errors";
import {DEFAULT_FUNDING_NOTIFY_TEMPLATE, FUNDING_NOTIFY_EVENTS, type FundingNotifyEvent} from "@brico/crafts/stelo";
import {
    type APIChatInputApplicationCommandInteraction,
    type APILabelComponent,
    type APIModalSubmission,
    type APIModalSubmitInteraction,
    ComponentType,
    TextInputStyle,
} from "discord-api-types/v10";
import {randomUUID} from "node:crypto";

import {timeReducerCall} from "../../metrics.ts";
import {discordUserIdFor, isCommandReply, requireInteractionContext, requireLinkedAccount, requirePermission} from "./context.ts";
import {type ModalMentionable, modalMentionableSelectValue, modalTextInputValue} from "./modal-options.ts";
import {findOwnDiscordNotifySink, MENTIONABLE_FIELD_ID, mentionableField} from "./notify.ts";
import type {CommandDeps, CommandReply, CommandShowModal, LeafCommand, ModalSubmitHandler} from "./registry.ts";
import {labelField} from "./watch.ts";

const FUNDING_SETUP_MODAL_ID = "watch_funding_setup";

const FIELD_LABELS: Record<FundingNotifyEvent, string> = {
    fundingFailed: "When funding a craft's bounty fails",
    payoutShortfall: "When a payout can't be pulled from your wallet",
    unclaimed: "When unclaimed money is moved",
};

function storedTemplate(target: DiscordFundingNotifyTarget, event: FundingNotifyEvent): string | undefined {
    return event === "fundingFailed" ? target.fundingFailedTemplate
        : event === "payoutShortfall" ? target.payoutShortfallTemplate : target.unclaimedTemplate;
}

function templateField(event: FundingNotifyEvent, value: string): APILabelComponent {
    return labelField(FIELD_LABELS[event], {
        type: ComponentType.TextInput,
        custom_id: event,
        style: TextInputStyle.Short,
        required: false,
        max_length: MAX_NOTIFY_TEMPLATE_LENGTH,
        value,
    });
}

/** Prefills default wording for a new sink; an existing target shows its stored state, with an empty field meaning that event is disabled. */
function buildFundingSetupModal(sink: DiscordNotifySink, existing: DiscordFundingNotifyTarget | undefined): CommandShowModal {
    return {
        modal: {
            custom_id: FUNDING_SETUP_MODAL_ID,
            title: "Setup Stelo funding alerts",
            components: [
                mentionableField(existing?.mentionType ?? sink.defaultMentionType, existing?.mentionId ?? sink.defaultMentionId),
                ...FUNDING_NOTIFY_EVENTS.map(event => templateField(
                    event,
                    existing ? (storedTemplate(existing, event) ?? "") : DEFAULT_FUNDING_NOTIFY_TEMPLATE[event],
                )),
            ],
        },
    };
}

const handleFundingSetup = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply | CommandShowModal> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;

    const sink = findOwnDiscordNotifySink(ctx.conn, accountIdentity, ctx.channelId);
    if (!sink) return {content: "This channel isn't linked yet — run `/watch notify-link` first."};

    const existing = ctx.conn.db.allDiscordFundingNotifyTarget.iter()
        .find(target => target.deletedAt === undefined && target.sinkId === sink.id && target.accountIdentity.isEqual(accountIdentity));
    return buildFundingSetupModal(sink, existing);
};

const handleFundingSetupSubmit: ModalSubmitHandler = async (interaction: APIModalSubmitInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;

    const sink = findOwnDiscordNotifySink(ctx.conn, accountIdentity, ctx.channelId);
    if (!sink) return {content: "This channel isn't linked yet — run `/watch notify-link` first."};

    const submission: APIModalSubmission = interaction.data;
    const mentionable: ModalMentionable | undefined = modalMentionableSelectValue(submission, MENTIONABLE_FIELD_ID);
    const template = (event: FundingNotifyEvent) => modalTextInputValue(submission, event) ?? "";

    try {
        await timeReducerCall("attach_discord_funding_target", ctx.conn.reducers.attachDiscordFundingTarget({
            id: randomUUID(),
            accountIdentity,
            discordSinkId: sink.id,
            fundingFailedTemplate: template("fundingFailed"),
            payoutShortfallTemplate: template("payoutShortfall"),
            unclaimedTemplate: template("unclaimed"),
            mentionType: mentionable?.type,
            mentionId: mentionable?.id,
            mentionName: mentionable?.name,
        }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("attach_discord_funding_target failed", {error: message});
        return {content: `Couldn't set up funding alerts: ${message}`};
    }
    return {content: "Stelo funding alerts are set up in this channel."};
};

export const watchFundingSetupCommand: LeafCommand = {
    path: ["watch", "funding-setup"],
    description: "Configure Discord alerts for Stelo funding problems in this channel.",
    handler: handleFundingSetup,
    modalCustomId: FUNDING_SETUP_MODAL_ID,
    modalSubmit: handleFundingSetupSubmit,
};
