/**
 * watch.ts — `/watch display` and `/watch display-remove`. `/watch display` opens a setup modal
 * (filter, style, field presets, sort) whose submit writes `attachDiscordWatchDisplay`; the
 * optional `filter` argument only chooses which existing display prefills it. Posting and editing
 * the message is `discord/display-manager.ts`'s job.
 *
 * **A modal holds 4 usable top-level components, despite the docs saying 5.** A 5th `Label` makes
 * Discord silently drop the interaction response ("the application didn't respond"), with nothing
 * to catch server-side. Sort field and direction are therefore one `SORT_FIELD_ID` select with
 * `"<field>:<direction>"` values, and `limit`/`stickyMinutes` have no modal field (see
 * `watch-display-options.ts`).
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {DiscordWatchDisplay} from "@brico/bindings/brico-app/types";
import {
    DEFAULT_DISPLAY_REFRESH_SECONDS,
    DISCORD_DISPLAY_FIELD_PRESET_KEYS,
    DISCORD_DISPLAY_FIELD_PRESETS,
    DISCORD_DISPLAY_SORT_DIRECTION_LABELS,
    DISCORD_DISPLAY_SORT_DIRECTIONS,
    DISCORD_DISPLAY_SORT_FIELD_LABELS,
    DISCORD_DISPLAY_SORT_FIELDS,
    DISCORD_DISPLAY_STYLE_LABELS,
    DISCORD_DISPLAY_STYLES,
    type DiscordDisplayFieldPresetKey,
    isDiscordDisplayFieldPresetKey,
    isDiscordDisplaySortDirection,
    isDiscordDisplaySortField,
    isDiscordDisplayStyle,
} from "@brico/crafts/discord-display";
import type {
    APIApplicationCommandAutocompleteInteraction,
    APIChatInputApplicationCommandInteraction,
    APIComponentInLabel,
    APILabelComponent,
    APIModalSubmission,
    APIModalSubmitInteraction,
    APISelectMenuOption,
} from "discord-api-types/v10";
import {ApplicationCommandOptionType, ComponentType} from "discord-api-types/v10";
import {randomUUID} from "node:crypto";
import type {Identity} from "spacetimedb";

import {timeReducerCall} from "../../metrics.ts";
import {discordUserIdFor, isCommandReply, requireInteractionContext, requireLinkedAccount, requirePermission, resolveAccountIdentity} from "./context.ts";
import {modalCheckboxGroupValues, modalStringSelectValue} from "./modal-options.ts";
import {leafOptions, stringOption} from "./options.ts";
import type {AutocompleteHandler, CommandDeps, CommandHandler, CommandReply, CommandShowModal, LeafCommand} from "./registry.ts";

const WATCH_DISPLAY_MODAL_ID = "watch_display_setup";
/** The slash-command option name; `FILTER_FIELD_ID` below is the modal field's `custom_id`. */
const FILTER_OPTION_NAME = "filter";
const FILTER_FIELD_ID = "filter";
const DISPLAY_OPTION_NAME = "display";
const STYLE_FIELD_ID = "style";
const PRESETS_FIELD_ID = "presets";
/** Combined sort field + direction; option values are `"<field>:<direction>"`. */
const SORT_FIELD_ID = "sort";

/** Defaults for a brand-new display; an edit keeps the existing row's values. */
const DEFAULT_LIMIT = 10;
const DEFAULT_STICKY_MINUTES = 0;

function sortOptionValue(field: string, direction: string): string {
    return `${field}:${direction}`;
}

/** Splits `"<field>:<direction>"`; `null` if either half is missing (validity of each half is checked by the caller). */
function parseSortOptionValue(value: string): {field: string; direction: string} | null {
    const [field, direction] = value.split(":");
    return field && direction ? {field, direction} : null;
}

/** The caller's own non-tombstoned saved filters. Scans the table because `all_saved_craft_filter` is only indexed on `id`. */
export function ownSavedFilters(conn: DbConnection, accountIdentity: Identity) {
    return conn.db.allSavedCraftFilter.iter().filter(saved => saved.deletedAt === undefined && saved.accountIdentity.isEqual(accountIdentity));
}

/** One of the caller's own non-tombstoned saved filters by id; `undefined` if it's missing, deleted, or someone else's. */
export function findOwnSavedFilter(conn: DbConnection, accountIdentity: Identity, filterId: string) {
    const saved = conn.db.allSavedCraftFilter.id.find(filterId);
    return saved && saved.deletedAt === undefined && saved.accountIdentity.isEqual(accountIdentity) ? saved : undefined;
}

/** Any existing display for this `(account, channel)`, regardless of filter; used to prefill the modal when no `filter` argument is given. */
function findExistingDisplayForChannel(conn: DbConnection, accountIdentity: Identity, channelId: string): DiscordWatchDisplay | null {
    return conn.db.allDiscordWatchDisplay.iter()
        .find(display => display.deletedAt === undefined && display.accountIdentity.isEqual(accountIdentity) && display.channelId === channelId) ?? null;
}

/** The existing display for this exact `(account, filter, channel)`, if any. */
export function findExistingDisplay(conn: DbConnection, accountIdentity: Identity, filterId: string, channelId: string): DiscordWatchDisplay | null {
    return conn.db.allDiscordWatchDisplay.iter().find(display =>
        display.deletedAt === undefined && display.accountIdentity.isEqual(accountIdentity) && display.filterId === filterId && display.channelId === channelId,
    ) ?? null;
}

/** Autocomplete for a `filter` option: the caller's saved filters matching the typed text. */
export const watchDisplayFilterAutocomplete: AutocompleteHandler = async (interaction: APIApplicationCommandAutocompleteInteraction, deps: CommandDeps) => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return [{name: "brico is temporarily unavailable — try again in a moment.", value: "unavailable"}];

    const accountIdentity = resolveAccountIdentity(ctx.conn, discordUserIdFor(ctx));
    if (accountIdentity === null) {
        // Autocomplete responses can only carry choices, so report this as one.
        return [{name: "Link your brico account first — run /link", value: "unlinked"}];
    }

    const typed = (stringOption(leafOptions(interaction), FILTER_OPTION_NAME) ?? "").toLowerCase();
    return ownSavedFilters(ctx.conn, accountIdentity)
        .filter(saved => saved.name.toLowerCase().includes(typed))
        .take(25)
        .map(saved => ({name: saved.name, value: saved.id}))
        .toArray();
};

/** Every non-tombstoned display in the channel, whoever created it. */
function channelDisplays(conn: DbConnection, channelId: string) {
    return conn.db.allDiscordWatchDisplay.iter().filter(display => display.deletedAt === undefined && display.channelId === channelId);
}

/** Autocomplete for `/watch display-remove`: the channel's existing displays, labeled by their filter's name; the value is the display id. */
const watchDisplayRemoveAutocomplete: AutocompleteHandler = async (interaction: APIApplicationCommandAutocompleteInteraction, deps: CommandDeps) => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return [{name: "brico is temporarily unavailable — try again in a moment.", value: "unavailable"}];

    if (resolveAccountIdentity(ctx.conn, discordUserIdFor(ctx)) === null) {
        return [{name: "Link your brico account first — run /link", value: "unlinked"}];
    }

    const typed = (stringOption(leafOptions(interaction), DISPLAY_OPTION_NAME) ?? "").toLowerCase();
    return channelDisplays(ctx.conn, ctx.channelId)
        .map(display => ({name: ctx.conn.db.allSavedCraftFilter.id.find(display.filterId)?.name ?? "deleted filter", value: display.id}))
        .filter(choice => choice.name.toLowerCase().includes(typed))
        .take(25)
        .toArray();
};

export function labelField(label: string, component: APIComponentInLabel, description?: string): APILabelComponent {
    return {type: ComponentType.Label, label, description, component};
}

function selectOptions<T extends string>(values: readonly T[], labels: Record<T, string>, selected: T | undefined): APISelectMenuOption[] {
    return values.map(value => ({value, label: labels[value], default: value === selected}));
}

/** Every sort field x direction as one select's options (10, under Discord's 25-option cap). */
function sortOptions(selectedField: string | undefined, selectedDirection: string | undefined): APISelectMenuOption[] {
    const options: APISelectMenuOption[] = [];
    for (const field of DISCORD_DISPLAY_SORT_FIELDS) {
        for (const direction of DISCORD_DISPLAY_SORT_DIRECTIONS) {
            options.push({
                value: sortOptionValue(field, direction),
                label: `${DISCORD_DISPLAY_SORT_FIELD_LABELS[field]} — ${DISCORD_DISPLAY_SORT_DIRECTION_LABELS[direction]}`,
                default: field === selectedField && direction === selectedDirection,
            });
        }
    }
    return options;
}

function presetsField(selected: readonly DiscordDisplayFieldPresetKey[]): APILabelComponent {
    return labelField(
        "Field presets",
        {
            type: ComponentType.CheckboxGroup,
            custom_id: PRESETS_FIELD_ID,
            required: false,
            min_values: 0,
            max_values: DISCORD_DISPLAY_FIELD_PRESET_KEYS.length,
            options: DISCORD_DISPLAY_FIELD_PRESET_KEYS.map(key => ({
                value: key,
                label: DISCORD_DISPLAY_FIELD_PRESETS[key].label,
                default: selected.includes(key),
            })),
        },
        "Composed into the display in a fixed order, regardless of the order checked here.",
    );
}

/** Builds the setup modal, prefilled from `existing` when set. */
function buildSetupModal(
    filterOptions: readonly APISelectMenuOption[],
    existing: DiscordWatchDisplay | null,
): CommandShowModal {
    const existingPresets = existing?.content.tag === "Presets" ? (existing.content.value.presets as DiscordDisplayFieldPresetKey[]) : DISCORD_DISPLAY_FIELD_PRESET_KEYS;

    return {
        modal: {
            custom_id: WATCH_DISPLAY_MODAL_ID,
            title: "Setup craft watch display",
            components: [
                labelField("Filter", {type: ComponentType.StringSelect, custom_id: FILTER_FIELD_ID, min_values: 1, max_values: 1, options: [...filterOptions]}),
                labelField("Style", {type: ComponentType.StringSelect, custom_id: STYLE_FIELD_ID, min_values: 1, max_values: 1, options: selectOptions(DISCORD_DISPLAY_STYLES, DISCORD_DISPLAY_STYLE_LABELS, existing?.style as (typeof DISCORD_DISPLAY_STYLES)[number] | undefined)}),
                presetsField(existingPresets),
                labelField("Sort by", {type: ComponentType.StringSelect, custom_id: SORT_FIELD_ID, min_values: 1, max_values: 1, options: sortOptions(existing?.sortField, existing?.sortDirection)}),
            ],
        },
    };
}

async function handleWatchDisplay(interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply | CommandShowModal> {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;

    // Discord's cap on select menu options.
    const savedFilters = ownSavedFilters(ctx.conn, accountIdentity).take(25).toArray();
    if (savedFilters.length === 0) {
        return {content: "You don't have any saved filters yet — save one on the Craft Browser first, then run this again."};
    }

    // An explicit `filter` prefills from that exact `(filter, channel)` display and pre-selects it
    // even when no display exists yet; without one, prefill from any display in the channel.
    const requestedFilterId = stringOption(leafOptions(interaction), FILTER_OPTION_NAME);
    const existing = requestedFilterId
        ? findExistingDisplay(ctx.conn, accountIdentity, requestedFilterId, ctx.channelId)
        : findExistingDisplayForChannel(ctx.conn, accountIdentity, ctx.channelId);
    const selectedFilterId = requestedFilterId ?? existing?.filterId;
    const filterOptions = savedFilters.map(saved => ({label: saved.name, value: saved.id, default: selectedFilterId === saved.id}));

    return buildSetupModal(filterOptions, existing);
}

async function handleWatchDisplaySubmit(interaction: APIModalSubmitInteraction, deps: CommandDeps): Promise<CommandReply> {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId} = ctx;

    const submission: APIModalSubmission = interaction.data;

    const filterId = modalStringSelectValue(submission, FILTER_FIELD_ID);
    const filter = filterId ? findOwnSavedFilter(conn, accountIdentity, filterId) : undefined;
    if (!filter) return {content: "That filter is no longer available — run `/watch display` again."};

    const style = modalStringSelectValue(submission, STYLE_FIELD_ID);
    if (!style || !isDiscordDisplayStyle(style)) return {content: "Choose a style."};

    const sortValue = modalStringSelectValue(submission, SORT_FIELD_ID);
    const parsedSort = sortValue ? parseSortOptionValue(sortValue) : null;
    if (!parsedSort || !isDiscordDisplaySortField(parsedSort.field) || !isDiscordDisplaySortDirection(parsedSort.direction)) {
        return {content: "Choose a sort."};
    }
    const {field: sortField, direction: sortDirection} = parsedSort;

    const presets = modalCheckboxGroupValues(submission, PRESETS_FIELD_ID).filter(isDiscordDisplayFieldPresetKey);

    // Reuse the existing `shareCode` (minting a new one per edit would orphan `shared_filter` rows
    // and change the link), and keep `limit`/`stickyMinutes`, which the modal can't edit.
    const existing = findExistingDisplay(conn, accountIdentity, filter.id, channelId);
    const limit = existing?.limit ?? DEFAULT_LIMIT;
    const stickyMinutes = existing?.stickyMinutes ?? DEFAULT_STICKY_MINUTES;
    let shareCode = existing?.shareCode;
    if (shareCode === undefined) {
        try {
            const result = await timeReducerCall(
                "create_shared_filters",
                conn.procedures.createSharedFilters({filterIds: [filter.id], accountIdentity}),
            );
            shareCode = result.code;
        } catch (cause) {
            // Best-effort: the display works without a share link.
            deps.log.warn("create_shared_filters failed; display will have no share link", {
                error: cause instanceof Error ? cause.message : String(cause),
            });
        }
    }

    try {
        await timeReducerCall("attach_discord_watch_display", conn.reducers.attachDiscordWatchDisplay({
            id: randomUUID(),
            accountIdentity,
            filterId: filter.id,
            channelId,
            content: {tag: "Presets", value: {presets}},
            style,
            sortField,
            sortDirection,
            limit,
            stickyMinutes,
            refreshIntervalSeconds: existing?.refreshIntervalSeconds ?? DEFAULT_DISPLAY_REFRESH_SECONDS,
            shareCode,
        }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("attach_discord_watch_display failed", {error: message});
        return {content: `Couldn't set up that display: ${message}`};
    }

    return {content: `Watch display for "${filter.name}" is set up in this channel.`};
}

export const watchDisplayCommand: LeafCommand = {
    path: ["watch", "display"],
    description: "Set up a live-updating message of a saved filter's current matches in this channel.",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: FILTER_OPTION_NAME,
            description: "Which saved filter to prefill the setup modal from, if this channel already watches more than one.",
            required: false,
            autocomplete: true,
        },
    ],
    handler: handleWatchDisplay,
    autocomplete: watchDisplayFilterAutocomplete,
    modalCustomId: WATCH_DISPLAY_MODAL_ID,
    modalSubmit: handleWatchDisplaySubmit,
};

/** `/watch display-remove` — tombstones the `(account, filter, channel)` display. `display-manager.ts` also does this when the channel returns 403/404. */
const handleWatchDisplayRemove: CommandHandler = async (interaction: APIChatInputApplicationCommandInteraction, deps: CommandDeps): Promise<CommandReply> => {
    const ctx = requireInteractionContext(interaction, deps);
    if (isCommandReply(ctx)) return ctx;
    const permissionError = requirePermission(ctx);
    if (permissionError) return permissionError;
    const accountIdentity = requireLinkedAccount(ctx.conn, discordUserIdFor(ctx));
    if (isCommandReply(accountIdentity)) return accountIdentity;
    const {conn, channelId} = ctx;

    const displayId = stringOption(leafOptions(interaction), DISPLAY_OPTION_NAME);
    const found = displayId ? conn.db.allDiscordWatchDisplay.id.find(displayId) : undefined;
    const existing = found && found.deletedAt === undefined && found.channelId === channelId ? found : undefined;
    if (!existing) return {content: "That watch display no longer exists in this channel — pick it again."};
    const filter = conn.db.allSavedCraftFilter.id.find(existing.filterId);
    const filterName = filter?.name ?? "deleted filter";

    try {
        await timeReducerCall("detach_discord_watch_display", conn.reducers.detachDiscordWatchDisplay({id: existing.id}));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        deps.log.warn("detach_discord_watch_display failed", {error: message});
        return {content: `Couldn't remove that display: ${message}`};
    }

    return {content: `Watch display for "${filterName}" disabled.`};
};

export const watchDisplayRemoveCommand: LeafCommand = {
    path: ["watch", "display-remove"],
    description: "Remove a watch display from this channel.",
    options: [
        {
            type: ApplicationCommandOptionType.String,
            name: DISPLAY_OPTION_NAME,
            description: "Which watch display in this channel to remove (by its saved filter).",
            required: true,
            autocomplete: true,
        },
    ],
    handler: handleWatchDisplayRemove,
    autocomplete: watchDisplayRemoveAutocomplete,
};
