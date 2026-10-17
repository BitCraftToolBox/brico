/**
 * registry.ts — the command tree: leaf commands addressed by a path of 1-2 segments, serialized into
 * Discord's registration JSON (`buildCommandTree`) and resolved back from an incoming interaction
 * (`resolveCommand`). `"flat"` mode registers top-level commands; `"grouped"` nests everything under
 * `/brico`. Resolution works for either mode.
 */
import type {DiscordCommandMode} from "@brico/crafts/discord-guild";
import type {REST} from "@discordjs/rest";
import type {
    APIApplicationCommandAutocompleteInteraction,
    APIApplicationCommandOption,
    APIApplicationCommandSubcommandGroupOption,
    APIApplicationCommandSubcommandOption,
    APIChatInputApplicationCommandInteraction,
    APIModalInteractionResponseCallbackData,
    APIModalSubmitInteraction,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import {ApplicationCommandOptionType, ApplicationCommandType} from "discord-api-types/v10";
import type {BricoAppConnection} from "../../app/connection.ts";
import type {Logger} from "../../log.ts";

/** Everything a command handler needs beyond the interaction payload itself. */
export interface CommandDeps {
    log: Logger;
    app: BricoAppConnection;
    /** `new URL(linkReturnUrl).origin` is the frontend's own origin — used to build links back to it (e.g. `/account/link`). */
    linkReturnUrl: string;
    /** The shared `@discordjs/rest` client. */
    rest: REST;
    applicationId: string;
}

export interface CommandReply {
    content: string;
    /** Defaults to `true` — almost every reply here carries something personal (a link code, an account state). */
    ephemeral?: boolean;
}

/** Shows a modal as the interaction response instead of a reply (the two are mutually exclusive). */
export interface CommandShowModal {
    modal: APIModalInteractionResponseCallbackData;
}

export type CommandHandler = (
    interaction: APIChatInputApplicationCommandInteraction,
    deps: CommandDeps,
) => Promise<CommandReply | CommandShowModal>;

/** Returns at most 25 choices, Discord's autocomplete cap. */
export type AutocompleteHandler = (
    interaction: APIApplicationCommandAutocompleteInteraction,
    deps: CommandDeps,
) => Promise<{name: string; value: string}[]>;

/** Handles the `MODAL_SUBMIT` interaction that follows a `handler` returning `CommandShowModal` with this same `modalCustomId`. */
export type ModalSubmitHandler = (
    interaction: APIModalSubmitInteraction,
    deps: CommandDeps,
) => Promise<CommandReply>;

export type CommandScope = "guild" | "dm";

/** The leaves that belong in `scope`'s registration — those with no `scope` of their own, or a matching one. */
export function leavesForScope(leaves: LeafCommand[], scope: CommandScope): LeafCommand[] {
    return leaves.filter(leaf => leaf.scope === undefined || leaf.scope === scope);
}

export interface LeafCommand {
    /** E.g. `["link"]` or `["watch", "display"]`; 1-2 segments (see `assertValidPath`). */
    path: string[];
    description: string;
    /** Basic (non-subcommand) options for this leaf, e.g. a string/user/mentionable argument. */
    options?: APIApplicationCommandSubcommandOption["options"];
    handler: CommandHandler;
    /** Where this leaf is registered: `"guild"`, `"dm"` (the global BotDM set), or both when omitted. Filtered by `leavesForScope`. */
    scope?: CommandScope;
    /** Handles `APPLICATION_COMMAND_AUTOCOMPLETE` interactions for this leaf, if any of its options are `autocomplete: true`. */
    autocomplete?: AutocompleteHandler;
    /** The `custom_id` of the modal `handler` shows; submissions are routed by it (`resolveModalLeaf`), so it must be unique across leaves. */
    modalCustomId?: string;
    modalSubmit?: ModalSubmitHandler;
}

/** Chat-input and autocomplete interactions share the same `data.name`/`data.options` shape. */
export type CommandLikeInteraction = APIChatInputApplicationCommandInteraction | APIApplicationCommandAutocompleteInteraction;

const DEFAULT_GROUP_NAME = "brico";

function assertValidPath(path: string[]): void {
    if (path.length < 1 || path.length > 2) {
        throw new Error(
            `command path must be 1-2 segments, got ${JSON.stringify(path)} — Discord's own nesting ` +
            `limit (command → optional subcommand-group → subcommand) leaves no room for more once ` +
            `"grouped" mode adds its own wrapping segment`,
        );
    }
}

interface RelativeLeaf {
    relPath: string[];
    leaf: LeafCommand;
}

function groupByFirstSegment(entries: RelativeLeaf[]): Map<string, RelativeLeaf[]> {
    const byFirstSegment = new Map<string, RelativeLeaf[]>();
    for (const entry of entries) {
        const key = entry.relPath[0];
        const bucket = byFirstSegment.get(key);
        if (bucket) bucket.push(entry);
        else byFirstSegment.set(key, [entry]);
    }
    return byFirstSegment;
}

/** Like `buildOptionsAt`, but every entry must be a bare subcommand (the deepest allowed level, inside a group). */
function buildSubOptions(entries: RelativeLeaf[]): APIApplicationCommandSubcommandOption[] {
    const options: APIApplicationCommandSubcommandOption[] = [];
    for (const [name, bucket] of groupByFirstSegment(entries)) {
        if (bucket.length !== 1 || bucket[0].relPath.length !== 1) {
            throw new Error(`"${name}" needs a subcommand group here, but this helper only ever produces bare subcommands — check buildOptionsAt`);
        }
        const {leaf} = bucket[0];
        options.push({
            type: ApplicationCommandOptionType.Subcommand,
            name,
            description: leaf.description,
            options: leaf.options,
        });
    }
    return options;
}

/** Groups `entries` by first path segment into subcommands/groups. `depth` counts nesting levels already consumed; exceeding Discord's two-level limit throws. */
function buildOptionsAt(entries: RelativeLeaf[], depth: number): APIApplicationCommandOption[] {
    const options: APIApplicationCommandOption[] = [];
    for (const [name, bucket] of groupByFirstSegment(entries)) {
        if (bucket.length === 1 && bucket[0].relPath.length === 1) {
            const {leaf} = bucket[0];
            options.push({
                type: ApplicationCommandOptionType.Subcommand,
                name,
                description: leaf.description,
                options: leaf.options,
            });
            continue;
        }

        if (depth + 1 >= 2) {
            throw new Error(`command group "${name}" needs a third nesting level, which Discord does not support — shorten one of its leaves' paths`);
        }
        const group: APIApplicationCommandSubcommandGroupOption = {
            type: ApplicationCommandOptionType.SubcommandGroup,
            name,
            description: `${name} commands`,
            options: buildSubOptions(
                bucket.map(entry => ({relPath: entry.relPath.slice(1), leaf: entry.leaf})),
            ),
        };
        options.push(group);
    }
    return options;
}

/** Same union `upsertDiscordGuildInstall` validates `commandMode` against. */
export type CommandTreeMode = DiscordCommandMode;

/**
 * Serializes `leaves` into the body for a `PUT /applications/{id}/guilds/{guildId}/commands` call.
 * `"flat"` gives each first path segment its own top-level command (`/link`, `/watch display`);
 * `"grouped"` nests everything under `groupName` (`/brico link`, `/brico watch display`).
 */
export function buildCommandTree(
    leaves: LeafCommand[],
    mode: CommandTreeMode,
    groupName: string = DEFAULT_GROUP_NAME,
): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    for (const leaf of leaves) assertValidPath(leaf.path);

    if (mode === "grouped") {
        return [
            {
                type: ApplicationCommandType.ChatInput,
                name: groupName,
                description: "Brico.app commands.",
                options: buildOptionsAt(leaves.map(leaf => ({relPath: leaf.path, leaf})), 0),
            },
        ];
    }

    const byTopName = groupByFirstSegment(leaves.map(leaf => ({relPath: leaf.path, leaf})));
    const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
    for (const [name, bucket] of byTopName) {
        if (bucket.length === 1 && bucket[0].relPath.length === 1) {
            const {leaf} = bucket[0];
            commands.push({
                type: ApplicationCommandType.ChatInput,
                name,
                description: leaf.description,
                options: leaf.options,
            });
            continue;
        }
        if (bucket.some(entry => entry.relPath.length === 1)) {
            throw new Error(`"${name}" has both a bare leaf and subcommand leaves sharing the same top-level name — ambiguous, rename one`);
        }
        // The top-level name is consumed, so recurse over the remaining segments.
        commands.push({
            type: ApplicationCommandType.ChatInput,
            name,
            description: `${name} commands`,
            options: buildOptionsAt(
                bucket.map(entry => ({relPath: entry.relPath.slice(1), leaf: entry.leaf})),
                0,
            ),
        });
    }
    return commands;
}

/** Finds the leaf for an interaction's invoked path, as-is (flat) or with a leading `groupName` stripped (grouped). */
export function resolveCommand(
    leaves: LeafCommand[],
    interaction: CommandLikeInteraction,
    groupName: string = DEFAULT_GROUP_NAME,
): LeafCommand | null {
    const data = interaction.data;
    if (!data || typeof data.name !== "string") return null;

    const segments: string[] = [data.name];
    let options = data.options;
    while (options && options.length === 1) {
        const option = options[0];
        if (option.type !== ApplicationCommandOptionType.Subcommand && option.type !== ApplicationCommandOptionType.SubcommandGroup) break;
        segments.push(option.name);
        options = "options" in option ? option.options : undefined;
    }

    const byPath = new Map(leaves.map(leaf => [leaf.path.join("."), leaf] as const));
    const full = byPath.get(segments.join("."));
    if (full) return full;

    if (segments[0] === groupName) {
        const stripped = byPath.get(segments.slice(1).join("."));
        if (stripped) return stripped;
    }
    return null;
}

/**
 * Finds the leaf for a `MODAL_SUBMIT` by `custom_id`. Matches `modalCustomId` exactly or as a
 * `` `${modalCustomId}:${context}` `` prefix, so a modal can carry context (e.g. a filter id) in its id.
 */
export function resolveModalLeaf(leaves: LeafCommand[], customId: string): LeafCommand | null {
    return leaves.find(leaf => leaf.modalCustomId === customId || (leaf.modalCustomId !== undefined && customId.startsWith(`${leaf.modalCustomId}:`))) ?? null;
}
