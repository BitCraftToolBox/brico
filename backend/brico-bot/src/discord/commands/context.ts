/**
 * context.ts — shared preconditions for command and modal-submit handlers: a live `brico-app`
 * connection, guild-vs-DM context, the invoker's permissions, and their linked brico account.
 *
 * Each `require*` function returns either the resolved value or a `CommandReply` to send straight
 * back; use `isCommandReply` to tell them apart. `channelId` alone keys per-channel resources in
 * both contexts (channel ids are globally unique); branch on `CommandContext.kind` only when the
 * distinction matters.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {APIInteractionGuildMember, APIUser} from "discord-api-types/v10";
import {PermissionFlagsBits} from "discord-api-types/v10";
import {Identity} from "spacetimedb";

import type {CommandDeps, CommandReply} from "./registry.ts";

/** The fields shared by chat-input and modal-submit interactions. Guild invocations carry `member` (whose `.user` is the invoker), DM invocations carry `user`. */
export interface CommandInteractionLike {
    member?: APIInteractionGuildMember;
    user?: APIUser;
    guild_id?: string;
    channel?: {id: string};
}

export interface GuildCommandContext {
    kind: "guild";
    member: APIInteractionGuildMember;
    guildId: string;
    channelId: string;
    conn: DbConnection;
}

export interface DmCommandContext {
    kind: "dm";
    user: APIUser;
    channelId: string;
    conn: DbConnection;
}

export type CommandContext = GuildCommandContext | DmCommandContext;

export function isCommandReply(value: unknown): value is CommandReply {
    return typeof value === "object" && value !== null && "content" in value;
}

/** Resolves the guild/DM context and a live `brico-app` connection. */
export function requireInteractionContext(interaction: CommandInteractionLike, deps: CommandDeps): CommandContext | CommandReply {
    const channelId = interaction.channel?.id;
    if (!channelId) return {content: "Couldn't tell which channel this is — try again."};

    const conn = deps.app.connection?.connection;
    if (!conn?.isActive) return {content: "brico is temporarily unavailable — try again in a moment."};

    if (interaction.member) {
        if (!interaction.guild_id) return {content: "Couldn't tell which server this is — try again."};
        return {kind: "guild", member: interaction.member, guildId: interaction.guild_id, channelId, conn};
    }
    if (interaction.user) {
        return {kind: "dm", user: interaction.user, channelId, conn};
    }
    // Defensive: Discord always sends `member` or `user`.
    return {content: "Couldn't tell who's running this command — try again."};
}

/** The invoking Discord user in either context. */
export function discordUserFor(ctx: CommandContext): APIUser {
    return ctx.kind === "guild" ? ctx.member.user : ctx.user;
}

/** The invoking user's Discord id. */
export function discordUserIdFor(ctx: CommandContext): string {
    return discordUserFor(ctx).id;
}

/** Reads the permission bitfield Discord includes on every guild interaction; no API call needed. */
export function hasManageGuild(member: APIInteractionGuildMember): boolean {
    return (BigInt(member.permissions) & PermissionFlagsBits.ManageGuild) !== 0n;
}

/** Requires `MANAGE_GUILD` ("Manage Server") in a guild; always passes in a DM (the user's own conversation). Returns a reply on failure, `null` on success. */
export function requirePermission(ctx: CommandContext): CommandReply | null {
    if (ctx.kind === "dm") return null;
    return hasManageGuild(ctx.member) ? null : {content: "You need the Manage Server permission in this server to do that here."};
}

/** Maps a Discord user id to the linked brico account via `linked_integration`; `null` if not linked. */
export function resolveAccountIdentity(conn: DbConnection, discordUserId: string): Identity | null {
    for (const link of conn.db.allLinkedIntegration.iter()) {
        if (link.provider === "discord" && link.externalId === discordUserId && link.revokedAt === undefined) {
            return link.accountIdentity;
        }
    }
    return null;
}

export function requireLinkedAccount(conn: DbConnection, discordUserId: string): Identity | CommandReply {
    const accountIdentity = resolveAccountIdentity(conn, discordUserId);
    return accountIdentity ?? {content: "Link your brico account first — run `/link`."};
}
