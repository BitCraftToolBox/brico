/**
 * watch-source.ts — where the bridge gets the filters it evaluates.
 *
 * `brico-app`'s `saved_craft_filter` × `craft_filter_notify_trigger` join,
 * read off the second connection, is the real source.
 */
import type {DbConnection} from "@brico/bindings/brico-app";
import type {CraftFilterNotifyTrigger, SavedCraftFilter} from "@brico/bindings/brico-app/types";
import {type FilterNode, parseFilter, validateFilter} from "@brico/crafts/filter";
import type {Identity} from "spacetimedb";

import type {Logger} from "../log.ts";
import type {BricoAppConnection} from "./connection.ts";

export interface WatchSpec {
    /** Stable id — the key the bridge's per-watch match set is stored under. */
    id: string;
    name: string;
    owner: string | null;
    filterId: string | null;
    triggers: {added: boolean; finished: boolean; removed: boolean};
    filter: FilterNode;
}

export interface WatchSource {
    /** Human description of where these came from, for the startup log. */
    readonly origin: string;
    /** Current watch set. Cheap — the bridge calls this every snapshot. */
    watches(): readonly WatchSpec[];
}

/**
 * The live trigger row for `(accountIdentity, filterId)` whose sink satisfies `matchSink`
 * (e.g. `sink => sink.tag === "Toast"`); lets a `MatchSink` check its own enablement. `null` if none.
 */
export function findNotifyTrigger(
    conn: DbConnection,
    accountIdentity: Identity,
    filterId: string,
    matchSink: (sink: CraftFilterNotifyTrigger["sink"]) => boolean,
): CraftFilterNotifyTrigger | null {
    for (const trigger of conn.db.allCraftFilterNotifyTrigger.iter()) {
        if (trigger.deletedAt !== undefined) continue;
        if (trigger.filterId !== filterId) continue;
        if (!trigger.accountIdentity.isEqual(accountIdentity)) continue;
        if (!matchSink(trigger.sink)) continue;
        return trigger;
    }
    return null;
}

/**
 * Watches derived from `brico-app`'s live `all_saved_craft_filter` × `all_craft_filter_notify_trigger`
 * join.
 *
 * A filter is watched if it has any non-tombstoned trigger row; its `triggers` are the OR across
 * sinks. `filterJson` is untrusted, so it goes through `parseFilter` and is skipped with a
 * `log.warn` on failure, never thrown. A trigger row with no matching (or mismatched-owner, or
 * tombstoned) filter row is skipped the same way.
 *
 * This is a genuine cross-database join: accounts' filters/triggers come off the `brico-app`
 * connection, crafts off prism's, and the same `@brico/crafts/filter` engine decides what each
 * account would be notified about.
 *
 * Returns `[]` when the connection is down, not yet live, or authorized to see nothing (the `all_*`
 * views are empty for an identity that is not a registered `service_principal`).
 */
export function createAccountWatchSource(app: BricoAppConnection, log: Logger): WatchSource {
    let lastCount = -1;
    return {
        origin: "brico-app all_saved_craft_filter × all_craft_filter_notify_trigger",
        watches() {
            const conn = app.connection?.connection;
            if (!conn?.isActive || !app.isLive) return [];

            const filtersById = new Map<string, SavedCraftFilter>();
            for (const savedFilter of conn.db.allSavedCraftFilter.iter()) {
                if (savedFilter.deletedAt !== undefined) continue;
                filtersById.set(savedFilter.id, savedFilter);
            }

            // Group by filterId so multiple sinks on one filter collapse into one WatchSpec.
            const triggersByFilterId = new Map<string, CraftFilterNotifyTrigger[]>();
            for (const trigger of conn.db.allCraftFilterNotifyTrigger.iter()) {
                if (trigger.deletedAt !== undefined) continue;
                const bucket = triggersByFilterId.get(trigger.filterId);
                if (bucket) bucket.push(trigger);
                else triggersByFilterId.set(trigger.filterId, [trigger]);
            }

            const specs: WatchSpec[] = [];
            for (const [filterId, triggers] of triggersByFilterId) {
                const savedFilter = filtersById.get(filterId);
                const owner = triggers[0]?.accountIdentity;
                if (!savedFilter || !owner || !savedFilter.accountIdentity.isEqual(owner)) {
                    log.warn("skipping watch: no matching saved filter", {filterId});
                    continue;
                }

                const filter = parseFilter(JSON.parse(savedFilter.filterJson));
                if (!filter) {
                    log.warn("skipping watch: invalid filterJson", {
                        filterId,
                        problems: validateFilter(JSON.parse(savedFilter.filterJson)).join("; "),
                    });
                    continue;
                }

                specs.push({
                    id: `watch:${filterId}`,
                    name: savedFilter.name,
                    owner: owner.toHexString(),
                    filterId,
                    triggers: {
                        added: triggers.some(t => t.added),
                        finished: triggers.some(t => t.finished),
                        removed: triggers.some(t => t.removed),
                    },
                    filter,
                });
            }

            if (specs.length !== lastCount) {
                lastCount = specs.length;
                log.info("watches derived from brico-app saved filters", {count: specs.length});
            }
            return specs;
        },
    };
}