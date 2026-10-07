/**
 * notification-sink.ts — the Discord `MatchSink`, posting to each linked channel. `event.watch.triggers`
 * is the OR across all sinks, so this re-checks each Discord sink's own trigger row.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {CraftFilterNotifyTrigger, DiscordNotifySink, DiscordNotifyTarget} from "@brico/bindings/brico-app/types";
import {DEFAULT_NOTIFY_TEMPLATE} from "@brico/crafts/discord-notify";
import {renderDiscordTemplate} from "@brico/crafts/discord-template";
import type {TriggerKind} from "@brico/crafts/watch";
import {DiscordAPIError, type REST} from "@discordjs/rest";
import {RESTPostAPIChannelMessageJSONBody, Routes} from "discord-api-types/v10";
import {Identity} from "spacetimedb";

import type {BricoAppConnection} from "../app/connection.ts";
import type {MatchEvent, MatchSink} from "../bridge.ts";
import type {RecipeDisplayIndex} from "../game-data/recipes.ts";
import type {SkillNameIndex} from "../game-data/skills.ts";
import type {Logger} from "../log.ts";
import {notificationsTotal, timeReducerCall} from "../metrics.ts";
import type {CraftRow} from "../relay/subject.ts";

export interface DiscordNotificationSinkOptions {
    app: BricoAppConnection;
    rest: REST;
    recipeNames: RecipeDisplayIndex;
    skillNames: SkillNameIndex;
    /** The brico web app's origin, which craft links point into. */
    frontendOrigin: string;
    log: Logger;
}

function findDiscordNotifySink(conn: DbConnection, id: string): DiscordNotifySink | null {
    for (const sink of conn.db.allDiscordNotifySink.iter()) {
        if (sink.id === id && sink.deletedAt === undefined) return sink;
    }
    return null;
}

function findDiscordNotifyTarget(conn: DbConnection, accountIdentity: Identity, filterId: string, sinkId: string): DiscordNotifyTarget | null {
    for (const target of conn.db.allDiscordNotifyTarget.iter()) {
        if (target.deletedAt !== undefined) continue;
        if (target.filterId !== filterId || target.sinkId !== sinkId) continue;
        if (!target.accountIdentity.isEqual(accountIdentity)) continue;
        return target;
    }
    return null;
}

/** Pair-specific override (on `discord_notify_target`) → sink default → no mention at all. */
function mentionTextFor(target: DiscordNotifyTarget | null, sink: DiscordNotifySink): string | null {
    const type = target?.mentionType ?? sink.defaultMentionType;
    const id = target?.mentionId ?? sink.defaultMentionId;
    if (!type || !id) return null;
    return type === "user" ? `<@${id}>` : `<@&${id}>`;
}

/** `undefined` (no custom template) falls back to the shared default for that event kind. */
function templateFor(target: DiscordNotifyTarget | null, kind: TriggerKind): string {
    if (!target) return DEFAULT_NOTIFY_TEMPLATE[kind];
    const stored = kind === "added" ? target.addedTemplate : kind === "finished" ? target.finishedTemplate : target.removedTemplate;
    return stored ?? DEFAULT_NOTIFY_TEMPLATE[kind];
}

function describeError(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

/** The channel is gone or the bot can no longer post there (403/404), as opposed to a transient failure. */
function isGone(cause: unknown): boolean {
    return cause instanceof DiscordAPIError && (cause.status === 403 || cause.status === 404);
}

export function createDiscordNotificationSink(options: DiscordNotificationSinkOptions): MatchSink {
    const log = options.log.child("notify");
    return event => {
        if (event.watch.owner === null || event.watch.filterId === null) return;
        const conn = options.app.connection?.connection;
        if (!conn?.isActive) return;

        const accountIdentity = Identity.fromString(event.watch.owner);
        const filterId = event.watch.filterId;

        const triggers: CraftFilterNotifyTrigger[] = [];
        for (const trigger of conn.db.allCraftFilterNotifyTrigger.iter()) {
            if (trigger.deletedAt !== undefined) continue;
            if (trigger.filterId !== filterId) continue;
            if (!trigger.accountIdentity.isEqual(accountIdentity)) continue;
            if (trigger.sink.tag !== "Discord") continue;
            if (!trigger[event.kind]) continue;
            triggers.push(trigger);
        }
        if (triggers.length === 0) return;

        for (const trigger of triggers) {
            // `trigger.sink.tag === "Discord"` was already checked in the filter loop above.
            const sinkId = (trigger.sink as {tag: "Discord"; value: {sinkId: string}}).value.sinkId;
            const sink = findDiscordNotifySink(conn, sinkId);
            if (!sink) continue;
            const target = findDiscordNotifyTarget(conn, accountIdentity, filterId, sinkId);

            sendNotification(options, event, sink, target, log).catch(cause => {
                log.error("failed to send Discord notification", {watch: event.watch.id, sink: sinkId, error: describeError(cause)});
            });
        }
    };
}

async function sendNotification(
    options: DiscordNotificationSinkOptions,
    event: MatchEvent,
    sink: DiscordNotifySink,
    target: DiscordNotifyTarget | null,
    log: Logger,
): Promise<void> {
    const craft: CraftRow | null = event.craft;
    const info = craft ? options.recipeNames.get(craft.recipeId) : undefined;
    const skillName = craft?.subject.skill != null ? (options.skillNames.get(craft.subject.skill) ?? null) : null;

    const template = templateFor(target, event.kind);
    const rendered = renderDiscordTemplate(template, {
        recipeName: info?.name ?? (craft ? `Recipe #${craft.recipeId}` : `Craft #${event.craftId}`),
        craftId: event.craftId,
        frontendOrigin: options.frontendOrigin,
        ownerName: craft?.ownerName ?? null,
        claimName: craft?.claimName ?? null,
        regionId: craft?.regionId ?? 0,
        tier: craft?.subject.tier ?? null,
        skillName,
        effortTotal: craft?.subject.effortTotal ?? 0,
        effortRemaining: craft?.subject.effortRemaining ?? 0,
        payout: craft?.subject.payout ?? null,
        currency: craft?.subject.currency ?? null,
        filterName: event.watch.name,
        mentionText: mentionTextFor(target, sink),
    });

    const mentionType = target?.mentionType ?? sink.defaultMentionType;
    const mentionId = target?.mentionId ?? sink.defaultMentionId;
    const body = {
        content: rendered,
        allowed_mentions: {
            parse: [],
            users: mentionType === "user" && mentionId ? [mentionId] : [],
            roles: mentionType === "role" && mentionId ? [mentionId] : [],
        },
    } satisfies RESTPostAPIChannelMessageJSONBody;

    try {
        await options.rest.post(Routes.channelMessages(sink.channelId), {body});
        notificationsTotal.inc({sink: "discord", kind: event.kind, outcome: "ok"});
    } catch (cause) {
        notificationsTotal.inc({sink: "discord", kind: event.kind, outcome: isGone(cause) ? "detached" : "failed"});
        if (isGone(cause)) {
            log.warn("notify sink channel no longer accessible; removing sink", {sink: sink.id, channel: sink.channelId});
            const conn = options.app.connection?.connection;
            if (conn?.isActive) {
                await timeReducerCall(
                    "detach_discord_notify_sink",
                    conn.reducers.detachDiscordNotifySink({id: sink.id}),
                ).catch(detachCause => {
                    log.error("detach_discord_notify_sink failed", {sink: sink.id, error: describeError(detachCause)});
                });
            }
            return;
        }
        log.error("failed to post notification message", {sink: sink.id, channel: sink.channelId, error: describeError(cause)});
    }
}
