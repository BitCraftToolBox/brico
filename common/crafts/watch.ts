/**
 * watch.ts — the added/finished/removed match-transition engine a watch runs on top of the filter.
 *
 * `evaluateFilter` (`./filter.ts`) only answers "does this one subject match right now" — a watch
 * needs to turn a *sequence* of snapshots into events: a craft entering the match set is `added`, one
 * leaving because it finished is `finished` (not a bare `removed` — see `wouldMatchIfOpen` below), and
 * anything else leaving is `removed`. This used to be `backend/brico-bot/src/bridge.ts`'s job alone;
 * it moves here so the frontend can run the exact same transition logic against localStorage-only
 * watches while the craft browser tab is open, with no backend connection required — the whole point
 * of a shared engine being that a watch that would fire in the bot previews identically in the browser.
 *
 * `createWatchMatcher` holds only the per-watch state (which crafts currently match, and whether the
 * first snapshot has been absorbed yet); it is deliberately silent on where watches or their filters
 * come from, what a sink does with an event, or how many watches exist — that bookkeeping differs by
 * caller (the bot has a `WatchSource` and a logging/Discord sink; the frontend will have its own
 * localStorage-backed set and toast/notification sink) and stays there.
 */
import type {CraftSubject} from "./filter.ts";
import {evaluateFilter, type FilterNode, wouldMatchIfOpen} from "./filter.ts";

/** The minimum shape a matcher needs from a row: its identity and its evaluable projection. */
export interface MatchRow {
    id: string;
    subject: CraftSubject;
}

/** What the sink is told about. `finished` fires once, on the transition into completeness. */
export type TriggerKind = "added" | "finished" | "removed";

export interface MatchEvent<TRow extends MatchRow> {
    kind: TriggerKind;
    /**
     * The craft. For `removed`, the row is usually gone from the *current* snapshot (that's why it
     * stopped matching) — this is the last row seen while it still matched, so a sink can still
     * report what it was (recipe, region, claim) instead of just its id. Only `null` if the matcher
     * has no prior row at all for this id, which should not happen in practice: `removed` only fires
     * for ids that were previously `added`.
     */
    craft: TRow | null;
    craftId: string;
}

export interface WatchMatcher<TRow extends MatchRow> {
    /**
     * Feeds one snapshot's rows through `filter`, returning every transition since the previous
     * call. The filter is passed in fresh each call (rather than fixed at construction) so an edited
     * saved filter takes effect on the very next snapshot, exactly as `evaluateFilter` called
     * directly would.
     *
     * The **first** call only primes the match set and returns no events — the caller's first
     * snapshot hands over every currently-open craft at once, and reporting `added` for all of them
     * would mean a fresh watch (or a restart) re-notifies a whole backlog. Events start on the
     * second call.
     */
    update(filter: FilterNode, rows: readonly TRow[]): MatchEvent<TRow>[];
    /** Crafts currently matching, as of the last `update`. */
    readonly matchCount: number;
    /** False until the first snapshot has been absorbed — see `update`. */
    readonly primed: boolean;
}

/** Craft id → its complete flag and its row, as of the last snapshot in which it matched. */
interface MatchedEntry<TRow extends MatchRow> {
    complete: boolean;
    row: TRow;
}

/** A fresh, unprimed matcher. One per watch; state is not shared across watches or filters. */
export function createWatchMatcher<TRow extends MatchRow>(): WatchMatcher<TRow> {
    let matched = new Map<string, MatchedEntry<TRow>>();
    let primed = false;

    return {
        get matchCount() {
            return matched.size;
        },
        get primed() {
            return primed;
        },

        update(filter, rows) {
            const events: MatchEvent<TRow>[] = [];
            const byId = new Map(rows.map(row => [row.id, row]));
            const stillMatched = new Map<string, MatchedEntry<TRow>>();

            for (const row of rows) {
                if (!evaluateFilter(filter, row.subject)) continue;
                const previous = matched.get(row.id);
                stillMatched.set(row.id, {complete: row.subject.complete, row});
                if (!primed) continue;
                if (previous === undefined) {
                    events.push({kind: "added", craft: row, craftId: row.id});
                    // A craft that is already complete when first seen is not a *transition* into
                    // completeness — reporting "finished" for it would mean every restart re-announces
                    // every finished craft still lingering in the source's retention window.
                } else if (!previous.complete && row.subject.complete) {
                    events.push({kind: "finished", craft: row, craftId: row.id});
                }
            }

            if (primed) {
                for (const [craftId, previous] of matched) {
                    if (stillMatched.has(craftId)) continue;
                    // Prefer the current snapshot's row (it's still there, just not matching), and
                    // fall back to the last row seen while it did match — the snapshot this update
                    // was fed may already have dropped the craft entirely (claimed/removed).
                    const row = byId.get(craftId) ?? previous.row;
                    // A craft that finished — and would still match this filter if it hadn't — is a
                    // `finished` transition, not a `removed` one, even though it fell out of
                    // `stillMatched` exactly the same way a claimed/gone-private craft would.
                    if (!previous.complete && row.subject.complete && wouldMatchIfOpen(filter, row.subject)) {
                        events.push({kind: "finished", craft: row, craftId});
                        continue;
                    }
                    // Otherwise the craft stopped matching for some other reason, or left the
                    // snapshot entirely (claimed/removed, or aged out of retention).
                    events.push({kind: "removed", craft: row, craftId});
                }
            } else {
                primed = true;
            }

            matched = stillMatched;
            return events;
        },
    };
}
