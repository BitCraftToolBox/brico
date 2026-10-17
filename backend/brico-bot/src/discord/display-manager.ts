/**
 * display-manager.ts — keeps each `discord_watch_display` message in Discord in sync, via a fixed-cadence
 * `sweep()` over the subscribed rows (a missed tick just makes the next refresh due later).
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {DiscordWatchDisplay} from "@brico/bindings/brico-app/types";
import {isDiscordDisplaySortDirection, isDiscordDisplaySortField, isDiscordDisplayStyle} from "@brico/crafts/discord-display";
import {parseFilter} from "@brico/crafts/filter";
import {DiscordAPIError, type REST} from "@discordjs/rest";
import type {APIMessageTopLevelComponent} from "discord-api-types/v10";
import {MessageFlags, Routes} from "discord-api-types/v10";
import {Timestamp} from "spacetimedb";

import type {BricoAppConnection} from "../app/connection.ts";
import type {RecipeDisplayIndex} from "../game-data/recipes.ts";
import type {SkillNameIndex} from "../game-data/skills.ts";
import type {Logger} from "../log.ts";
import {activeDisplays, displayFilters, displayRenderDuration, displayUpdatesTotal, timeReducerCall} from "../metrics.ts";
import type {CraftRow} from "../relay/subject.ts";
import type {DiscordWatchDisplayContentValue} from "./display-format.ts";
import {buildDisplayComponents, selectDisplayRows} from "./display-format.ts";

/** How often the sweep runs. */
const SWEEP_INTERVAL_MS = 5_000;
/** Stagger for newly seen displays so several don't post in the same tick. */
const NEW_DISPLAY_JITTER_MS = 2_000;

export interface DisplayManagerOptions {
    app: BricoAppConnection;
    rest: REST;
    recipeNames: RecipeDisplayIndex;
    skillNames: SkillNameIndex;
    /** The brico web app's origin (e.g. `https://brico.app`), which craft links point into. */
    frontendOrigin: string;
    /** brico-bot's public origin, serving icon thumbnails (`BotConfig.httpBaseUrl`). */
    botHttpBaseUrl: string;
    /** Origin of the fallback icon sprite (`BotConfig.assetCdnBase`). */
    assetCdnBase: string;
    log: Logger;
}

export interface DisplayManager {
    /** Feed from the bridge's `onRowsComputed`: the latest resolved craft rows. */
    onRowsComputed(rows: CraftRow[]): void;
    stop(): void;
}

function describeError(cause: unknown): string {
    if (cause instanceof Error) return cause.message;
    return String(cause);
}

function isNotFound(cause: unknown): boolean {
    return cause instanceof DiscordAPIError && cause.status === 404;
}

/** The bot can no longer post in the channel (kicked, permission removed). */
function isForbidden(cause: unknown): boolean {
    return cause instanceof DiscordAPIError && cause.status === 403;
}

export function createDisplayManager(options: DisplayManagerOptions): DisplayManager {
    const log = options.log.child("display");
    let latestRows: CraftRow[] = [];
    /** Display id → when it's next due for an in-place edit (seeded with jitter on first sight). */
    const nextDueAtMs = new Map<string, number>();
    /** Display id → when it's next due for a sticky repost (delete + resend); only for `stickyMinutes > 0`. */
    const nextStickyAtMs = new Map<string, number>();

    async function postOrEdit(conn: DbConnection, display: DiscordWatchDisplay, components: APIMessageTopLevelComponent[], sticky: boolean): Promise<void> {
        let messageId = display.messageId;
        const body = {components, flags: MessageFlags.IsComponentsV2};

        if (!sticky && messageId !== undefined) {
            try {
                await options.rest.patch(Routes.channelMessage(display.channelId, messageId), {body});
                displayUpdatesTotal.inc({outcome: "edited"});
                await recordMessage(conn, display.id, messageId, true);
                return;
            } catch (cause) {
                if (isForbidden(cause)) {
                    await markDeleted(conn, display);
                    return;
                }
                if (!isNotFound(cause)) {
                    displayUpdatesTotal.inc({outcome: "failed"});
                    log.error("failed to edit display message", {display: display.id, error: describeError(cause)});
                    return;
                }
                // The message was deleted out from under us — fall through and repost as new.
                messageId = undefined;
            }
        } else if (sticky && messageId !== undefined) {
            try {
                await options.rest.delete(Routes.channelMessage(display.channelId, messageId));
            } catch (cause) {
                if (!isNotFound(cause)) {
                    log.warn("failed to delete previous sticky message", {display: display.id, error: describeError(cause)});
                }
            }
        }

        try {
            const posted = (await options.rest.post(Routes.channelMessages(display.channelId), {body})) as {id: string};
            displayUpdatesTotal.inc({outcome: "posted"});
            await recordMessage(conn, display.id, posted.id, false);
        } catch (cause) {
            if (isForbidden(cause) || isNotFound(cause)) {
                await markDeleted(conn, display);
                return;
            }
            displayUpdatesTotal.inc({outcome: "failed"});
            log.error("failed to post display message", {display: display.id, error: describeError(cause)});
        }
    }

    async function recordMessage(conn: DbConnection, id: string, messageId: string, edited: boolean): Promise<void> {
        if (!conn.isActive) return;
        await timeReducerCall(
            "set_discord_watch_display_message",
            conn.reducers.setDiscordWatchDisplayMessage({id, messageId, postedAt: Timestamp.now(), edited}),
        ).catch(cause => {
            log.error("set_discord_watch_display_message failed", {display: id, error: describeError(cause)});
        });
    }

    /** The channel stopped accepting posts (403/404): tombstone the display (same reducer as `/watch display-remove`). */
    async function markDeleted(conn: DbConnection, display: DiscordWatchDisplay): Promise<void> {
        if (!conn.isActive) return;
        displayUpdatesTotal.inc({outcome: "detached"});
        log.warn("display channel no longer accessible; removing display", {display: display.id, channel: display.channelId});
        await timeReducerCall(
            "detach_discord_watch_display",
            conn.reducers.detachDiscordWatchDisplay({id: display.id}),
        ).catch(cause => {
            log.error("detach_discord_watch_display failed", {display: display.id, error: describeError(cause)});
        });
    }

    async function refresh(conn: DbConnection, display: DiscordWatchDisplay, sticky: boolean): Promise<void> {
        const savedFilter = conn.db.allSavedCraftFilter.id.find(display.filterId);
        if (!savedFilter || !savedFilter.accountIdentity.isEqual(display.accountIdentity)) {
            displayUpdatesTotal.inc({outcome: "skipped"});
            log.warn("skipping display: its saved filter is gone", {display: display.id});
            return;
        }
        if (!isDiscordDisplayStyle(display.style) || !isDiscordDisplaySortField(display.sortField) || !isDiscordDisplaySortDirection(display.sortDirection)) {
            displayUpdatesTotal.inc({outcome: "skipped"});
            log.warn("skipping display: unknown style/sort field/sort direction", {
                display: display.id, style: display.style, sortField: display.sortField, sortDirection: display.sortDirection,
            });
            return;
        }

        const filter = parseFilter(JSON.parse(savedFilter.filterJson));
        if (!filter) {
            displayUpdatesTotal.inc({outcome: "skipped"});
            log.warn("skipping display: its saved filter's JSON is invalid", {display: display.id});
            return;
        }

        const stopRender = displayRenderDuration.startTimer();
        const {rows, totalMatches} = selectDisplayRows(latestRows, filter, display.accountIdentity.toHexString(), display.sortField, display.sortDirection, display.limit);
        const components = buildDisplayComponents(
            savedFilter.name,
            display.content as DiscordWatchDisplayContentValue,
            display.style,
            rows,
            totalMatches,
            options.recipeNames,
            options.skillNames,
            options.frontendOrigin,
            options.botHttpBaseUrl,
            options.assetCdnBase,
            display.shareCode,
        );
        stopRender();
        await postOrEdit(conn, display, components, sticky);
    }

    async function sweep(): Promise<void> {
        const conn = options.app.connection?.connection;
        if (!conn?.isActive || !options.app.isLive) return;

        const now = Date.now();
        const liveIds = new Set<string>();
        const filterIds = new Set<string>();

        for (const display of conn.db.allDiscordWatchDisplay.iter()) {
            if (display.deletedAt !== undefined) continue;
            liveIds.add(display.id);
            filterIds.add(display.filterId);

            let dueAt = nextDueAtMs.get(display.id);
            if (dueAt === undefined) {
                dueAt = now + Math.floor(Math.random() * NEW_DISPLAY_JITTER_MS);
                nextDueAtMs.set(display.id, dueAt);
            }

            let stickyDue = false;
            if (display.stickyMinutes > 0) {
                let stickyAt = nextStickyAtMs.get(display.id);
                if (stickyAt === undefined) {
                    stickyAt = now + display.stickyMinutes * 60_000 + Math.floor(Math.random() * NEW_DISPLAY_JITTER_MS);
                    nextStickyAtMs.set(display.id, stickyAt);
                }
                if (now >= stickyAt) {
                    stickyDue = true;
                    nextStickyAtMs.set(display.id, now + display.stickyMinutes * 60_000);
                }
            } else {
                nextStickyAtMs.delete(display.id);
            }

            // A sticky repost also refreshes the content, so it replaces the plain edit.
            if (!stickyDue && now < dueAt) continue;

            nextDueAtMs.set(display.id, now + display.refreshIntervalSeconds * 1000);
            await refresh(conn, display, stickyDue).catch(cause => {
                log.error("display refresh threw", {display: display.id, error: describeError(cause)});
            });
        }

        activeDisplays.set(liveIds.size);
        displayFilters.set(filterIds.size);

        // Drop timers for displays that disappeared.
        for (const id of [...nextDueAtMs.keys()]) {
            if (!liveIds.has(id)) nextDueAtMs.delete(id);
        }
        for (const id of [...nextStickyAtMs.keys()]) {
            if (!liveIds.has(id)) nextStickyAtMs.delete(id);
        }
    }

    const timer = setInterval(() => {
        sweep().catch(cause => log.error("sweep threw", {error: describeError(cause)}));
    }, SWEEP_INTERVAL_MS);

    return {
        onRowsComputed(rows) {
            latestRows = rows;
        },
        stop() {
            clearInterval(timer);
        },
    };
}
