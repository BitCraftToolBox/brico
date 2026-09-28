/**
 * notify.ts — `/watch notify-link`, `/watch notify-unlink` and `/watch notify-setup`, which manage
 * Discord notification sinks (one per channel) and per-filter targets. They are hyphenated
 * siblings rather than a `/watch notify` group because `LeafCommand.path` allows at most two
 * segments.
 *
 * `notify-setup`'s modal has no room for a filter picker (4-component cap, see `watch.ts`), so the
 * filter id travels in the modal `custom_id` as `` `${WATCH_NOTIFY_SETUP_MODAL_ID}:${filterId}` ``
 * (matched by `resolveModalLeaf`). Per-event on/off is derived server-side by
 * `attachDiscordNotifyTarget` from whether each template field was left empty.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {DiscordNotifySink, DiscordNotifyTarget} from "@brico/bindings/brico-app/types";
import {DEFAULT_NOTIFY_TEMPLATE} from "@brico/crafts/discord-notify";
import {MAX_NOTIFY_TEMPLATE_LENGTH} from "@brico/crafts/errors";
import type {TriggerKind} from "@brico/crafts/watch";
import {
    APIChatInputApplicationCommandInteraction,
    APILabelComponent,
    APIModalSubmission,
    APIModalSubmitInteraction,
    ApplicationCommandOptionType,
    ChannelType,
    ComponentType,
    SelectMenuDefaultValueType,
    TextInputStyle,
} from "discord-api-types/v10";
import {randomUUID} from "node:crypto";
import type {Identity} from "spacetimedb";

import {timeReducerCall} from "../../metrics.ts";
import {discordUserIdFor, isCommandReply, requireInteractionContext, requireLinkedAccount, requirePermission} from "./context.ts";
import {type ModalMentionable, modalMentionableSelectValue, modalTextInputValue} from "./modal-options.ts";
import {leafOptions, mentionableOption, stringOption} from "./options.ts";
import type {CommandDeps, CommandHandler, CommandReply, CommandShowModal, LeafCommand, ModalSubmitHandler} from "./registry.ts";
import {labelField, ownSavedFilters, watchDisplayFilterAutocomplete} from "./watch.ts";

const FILTER_OPTION_NAME = "filter";
const MENTIONABLE_OPTION_NAME = "mentionable";
const WATCH_NOTIFY_SETUP_MODAL_ID = "watch_notify_setup";
const MENTIONABLE_FIELD_ID = "mentionable";
const TEMPLATE_FIELD_IDS: Record<TriggerKind, string> = {added: "added", finished: "finished", removed: "removed"};

/** The caller's own, non-tombstoned sink for this channel; `null` if `/watch notify-link` hasn't been run here. */
function findOwnDiscordNotifySink(conn: DbConnection, accountIdentity: Identity, channelId: string): DiscordNotifySink | null {
    for (const sink of conn.db.allDiscordNotifySink.iter()) {
        if (sink.deletedAt !== undefined) continue;
        if (sink.accountIdentity.isEqual(accountIdentity) && sink.channelId === channelId) return sink;
    }
    return null;
}

/** The existing `(account, filter, sink)` target, if any. */
function findOwnDiscordNotifyTarget(conn: DbConnection, accountIdentity: Identity, filterId: string, sinkId: string): DiscordNotifyTarget | null {
    for (const target of conn.db.allDiscordNotifyTarget.iter()) {
        if (target.deletedAt !== undefined) continue;
        if (target.accountIdentity.isEqual(accountIdentity) && target.filterId === filterId && target.sinkId === sinkId) return target;
    }
    return null;
}

const handleNotifyLink: CommandHandler = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId, kind} = ctx;

    const mentionable = mentionableOption(interaction, leafOptions(interaction), MENTIONABLE_OPTION_NAME);
    const existing = findOwnDiscordNotifySink(conn, accountIdentity, channelId);

    const isThread = (type: ChannelType) => type === ChannelType.AnnouncementThread || type === ChannelType.PublicThread || type == ChannelType.PrivateThread;

    const channelName = kind === "guild" ? `${isThread(interaction.channel.type) ? "🧵" : "#"}${interaction.channel.name ?? interaction.channel.id}`
        : /*kind === "dm" ? */`@${ctx.user.global_name ?? ctx.user.username}`;

    try {
        await timeReducerCall("attach_discord_notify_sink", conn.reducers.attachDiscordNotifySink({
            id: existing?.id ?? randomUUID(),
            accountIdentity,
            channelId,
            channelName,
            defaultMentionType: mentionable?.kind ?? existing?.defaultMentionType,
            defaultMentionId: mentionable ? (mentionable.kind === "user" ? mentionable.user.id : mentionable.role.id) : existing?.defaultMentionId,
            defaultMentionName: mentionable
                ? (mentionable.kind === "user" ? (mentionable.user.global_name ?? mentionable.user.username) : mentionable.role.name)
                : existing?.defaultMentionName,
        }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("attach_discord_notify_sink failed", {error: message});
        return {content: `Couldn't link this channel: ${message}`};
    }

    return {
        content: existing
            ? "This channel's notification settings are updated. Run `/watch notify-setup` to configure it for a saved filter."
            : "This channel is now linked for notifications. Run `/watch notify-setup` to configure it for a saved filter.",
    };
};

export const watchNotifyLinkCommand: LeafCommand = {
    path: ["watch", "notify-link"],
    description: "Link this channel as a Discord notification destination for your saved filters.",
    options: [
        {
            type: ApplicationCommandOptionType.Mentionable,
            name: MENTIONABLE_OPTION_NAME,
            description: "Default user or role to ping for notifications sent to this channel.",
            required: false,
        },
    ],
    handler: handleNotifyLink,
};

const handleNotifyUnlink: CommandHandler = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId} = ctx;

    const sink = findOwnDiscordNotifySink(conn, accountIdentity, channelId);
    if (!sink) return {content: "This channel isn't linked for notifications."};

    try {
        await timeReducerCall("detach_discord_notify_sink", conn.reducers.detachDiscordNotifySink({id: sink.id}));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("detach_discord_notify_sink failed", {error: message});
        return {content: `Couldn't unlink this channel: ${message}`};
    }

    return {content: "This channel is no longer linked for notifications."};
};

export const watchNotifyUnlinkCommand: LeafCommand = {
    path: ["watch", "notify-unlink"],
    description: "Unlink this channel as a Discord notification destination.",
    handler: handleNotifyUnlink,
};

function mentionableField(mentionType: string | undefined, mentionId: string | undefined): APILabelComponent {
    return labelField(
        "Mentionable",
        {
            type: ComponentType.MentionableSelect,
            custom_id: MENTIONABLE_FIELD_ID,
            required: false,
            min_values: 0,
            max_values: 1,
            default_values: mentionType === "user"
                ? [{type: SelectMenuDefaultValueType.User, id: mentionId!}]
                : mentionType === "role"
                    ? [{type: SelectMenuDefaultValueType.Role, id: mentionId!}]
                    : undefined,
        },
        "Who to ping — leave empty for no mention.",
    );
}

function templateField(kind: TriggerKind, label: string, value: string): APILabelComponent {
    return labelField(
        label,
        {
            type: ComponentType.TextInput,
            custom_id: TEMPLATE_FIELD_IDS[kind],
            style: TextInputStyle.Short,
            required: false,
            max_length: MAX_NOTIFY_TEMPLATE_LENGTH,
            value,
        },
        undefined,
    );
}

/** Prefills default wording for a new pair; an existing pair shows its stored state, with an empty field meaning that event is disabled. */
function buildNotifySetupModal(filterId: string, sink: DiscordNotifySink, existing: DiscordNotifyTarget | null): CommandShowModal {
    const mentionType = existing?.mentionType ?? sink.defaultMentionType;
    const mentionId = existing?.mentionId ?? sink.defaultMentionId;

    return {
        modal: {
            custom_id: `${WATCH_NOTIFY_SETUP_MODAL_ID}:${filterId}`,
            title: "Setup craft watch notifications",
            components: [
                mentionableField(mentionType, mentionId),
                templateField("added", "When a craft now matches", existing ? (existing.addedTemplate ?? "") : DEFAULT_NOTIFY_TEMPLATE.added),
                templateField("finished", "When a craft finishes", existing ? (existing.finishedTemplate ?? "") : DEFAULT_NOTIFY_TEMPLATE.finished),
                templateField("removed", "When a craft no longer matches", existing ? (existing.removedTemplate ?? "") : DEFAULT_NOTIFY_TEMPLATE.removed),
            ],
        },
    };
}

const handleNotifySetup: CommandHandler = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply | CommandShowModal> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId} = ctx;

    const sink = findOwnDiscordNotifySink(conn, accountIdentity, channelId);
    if (!sink) return {content: "This channel isn't linked yet — run `/watch notify-link` first."};

    const filterId = stringOption(leafOptions(interaction), FILTER_OPTION_NAME);
    const filter = filterId ? [...ownSavedFilters(conn, accountIdentity)].find(saved => saved.id === filterId) : undefined;
    if (!filter) return {content: "That filter is no longer available — pick it again."};

    const existing = findOwnDiscordNotifyTarget(conn, accountIdentity, filter.id, sink.id);
    return buildNotifySetupModal(filter.id, sink, existing);
};

const handleNotifySetupSubmit: ModalSubmitHandler = async (interaction: APIModalSubmitInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId} = ctx;

    const sink = findOwnDiscordNotifySink(conn, accountIdentity, channelId);
    if (!sink) return {content: "This channel isn't linked yet — run `/watch notify-link` first."};

    const filterId = interaction.data.custom_id.slice(`${WATCH_NOTIFY_SETUP_MODAL_ID}:`.length);
    const filter = [...ownSavedFilters(conn, accountIdentity)].find(saved => saved.id === filterId);
    if (!filter) return {content: "That filter is no longer available — run `/watch notify-setup` again."};

    const submission: APIModalSubmission = interaction.data;
    const mentionable: ModalMentionable | undefined = modalMentionableSelectValue(submission, MENTIONABLE_FIELD_ID);
    const addedTemplate = modalTextInputValue(submission, TEMPLATE_FIELD_IDS.added) ?? "";
    const finishedTemplate = modalTextInputValue(submission, TEMPLATE_FIELD_IDS.finished) ?? "";
    const removedTemplate = modalTextInputValue(submission, TEMPLATE_FIELD_IDS.removed) ?? "";

    try {
        await timeReducerCall("attach_discord_notify_target", conn.reducers.attachDiscordNotifyTarget({
            id: randomUUID(),
            accountIdentity,
            filterId: filter.id,
            discordSinkId: sink.id,
            addedTemplate,
            finishedTemplate,
            removedTemplate,
            mentionType: mentionable?.type,
            mentionId: mentionable?.id,
            mentionName: mentionable?.name,
        }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("attach_discord_notify_target failed", {error: message});
        return {content: `Couldn't set up that notification: ${message}`};
    }

    return {content: `Discord notifications for "${filter.name}" are set up in this channel.`};
};

export const watchNotifySetupCommand: LeafCommand = {
    path: ["watch", "notify-setup"],
    description: "Configure Discord notifications for a saved filter in this channel.",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: FILTER_OPTION_NAME,
            description: "Which saved filter to configure notifications for.",
            required: true,
            autocomplete: true,
        },
    ],
    handler: handleNotifySetup,
    autocomplete: watchDisplayFilterAutocomplete,
    modalCustomId: WATCH_NOTIFY_SETUP_MODAL_ID,
    modalSubmit: handleNotifySetupSubmit,
};
