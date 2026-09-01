/**
 * watch-source.ts — where the bridge gets the filters it evaluates.
 *
 * `brico-app`'s `saved_craft_filter` × `craft_filter_watch` join, read off the second connection,
 * is the real source.
 */
import type {SavedCraftFilter} from "@brico/bindings/brico-app/types";
import {type FilterNode, parseFilter, validateFilter} from "@brico/crafts/filter";

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
 * Watches derived from `brico-app`'s live `all_saved_craft_filter` × `all_craft_filter_watch` join.
 *
 * For each non-tombstoned `all_craft_filter_watch` row, the matching `all_saved_craft_filter` row
 * supplies the actual `FilterNode`. This is untrusted JSON at this boundary, so it goes through
 * `parseFilter` and is skipped with a `log.warn` on failure, never thrown. A watch row with no matching
 * (or mismatched-owner, or tombstoned) filter row is skipped the same way.
 *
 * This is a genuine cross-database join: accounts' filters/watches come off the `brico-app`
 * connection, crafts off prism's, and the same `@brico/crafts/filter` engine decides what each
 * account would be notified about.
 *
 * Returns `[]` when the connection is down, not yet live, or authorized to see nothing (the `all_*`
 * views are empty for an identity that is not a registered `service_principal`).
 */
export function createAccountWatchSource(app: BricoAppConnection, log: Logger): WatchSource {
    let lastCount = -1;
    return {
        origin: "brico-app all_saved_craft_filter × all_craft_filter_watch",
        watches() {
            const conn = app.connection?.connection;
            if (!conn?.isActive || !app.isLive) return [];

            const filtersById = new Map<string, SavedCraftFilter>();
            for (const savedFilter of conn.db.allSavedCraftFilter.iter()) {
                if (savedFilter.deletedAt !== undefined) continue;
                filtersById.set(savedFilter.id, savedFilter);
            }

            const specs: WatchSpec[] = [];
            for (const watch of conn.db.allCraftFilterWatch.iter()) {
                if (watch.deletedAt !== undefined) continue;

                const savedFilter = filtersById.get(watch.filterId);
                if (!savedFilter || !savedFilter.accountIdentity.isEqual(watch.accountIdentity)) {
                    log.warn("skipping watch: no matching saved filter", {filterId: watch.filterId});
                    continue;
                }

                const filter = parseFilter(JSON.parse(savedFilter.filterJson));
                if (!filter) {
                    log.warn("skipping watch: invalid filterJson", {
                        filterId: watch.filterId,
                        problems: validateFilter(JSON.parse(savedFilter.filterJson)).join("; "),
                    });
                    continue;
                }

                specs.push({
                    id: `watch:${watch.filterId}`,
                    name: savedFilter.name,
                    owner: watch.accountIdentity.toHexString(),
                    filterId: watch.filterId,
                    triggers: {added: watch.added, finished: watch.finished, removed: watch.removed},
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