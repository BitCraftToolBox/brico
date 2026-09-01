/**
 * watches.ts — runs the shared `@brico/crafts/watch` transition engine over the craft browser's own
 * live feed, entirely client-side.
 */
import {createWatchMatcher, type MatchEvent, type WatchMatcher} from "@brico/crafts/watch";
import {type Accessor, createEffect, onCleanup} from "solid-js";
import type {CraftEntry} from "~/lib/crafts/entries";
import type {CraftWatchTriggers, SavedCraftFilter} from "~/lib/settings";

export interface WatchNotification {
    filterId: string;
    filterName: string;
    event: MatchEvent<CraftEntry>;
}

function isWatchActive(triggers: CraftWatchTriggers | undefined): triggers is CraftWatchTriggers {
    return !!triggers && (triggers.added || triggers.finished || triggers.removed);
}

/**
 * Feeds `entries()` through a `WatchMatcher` per actively-watched saved filter and calls `onNotify`
 * for every transition whose trigger is enabled. Must be called during a component's setup (it uses
 * `createEffect`/`onCleanup`), and does nothing on its own beyond invoking `onNotify` — toasting,
 * logging or anything else the caller wants is its job, not this function's.
 *
 * `ready` must stay false until `entries()` reflects a real relay snapshot rather than the relay's
 * pre-connect placeholder (`EMPTY_SNAPSHOT` in `~/lib/crafts/relay`). A `WatchMatcher`'s first
 * `update` call only primes and never reports events — that guard exists so a fresh watch doesn't
 * replay a backlog of "added" events for every craft already open. If that first call were fed the
 * placeholder's empty row set instead of the real one, priming would consume itself against nothing,
 * and the *second* call — the first real snapshot the relay delivers — would then report every
 * already-matching craft as newly "added". Skipping the effect entirely while `!ready()` keeps the
 * placeholder from ever reaching the matcher, so priming lands on the first real snapshot instead.
 */
export function createCraftWatchRunner(
    entries: Accessor<CraftEntry[]>,
    savedFilters: Accessor<SavedCraftFilter[]>,
    watches: Accessor<Record<string, CraftWatchTriggers>>,
    ready: Accessor<boolean>,
    onNotify: (notification: WatchNotification) => void,
): void {
    const matchers = new Map<string, WatchMatcher<CraftEntry>>();

    createEffect(() => {
        if (!ready()) return;
        const rows = entries();
        const triggersById = watches();
        const activeIds = new Set<string>();

        for (const saved of savedFilters()) {
            const triggers = triggersById[saved.id];
            if (!isWatchActive(triggers)) continue;
            activeIds.add(saved.id);

            let matcher = matchers.get(saved.id);
            if (!matcher) {
                matcher = createWatchMatcher<CraftEntry>();
                matchers.set(saved.id, matcher);
            }
            for (const event of matcher.update(saved.filter, rows)) {
                if (!triggers[event.kind]) continue;
                onNotify({filterId: saved.id, filterName: saved.name, event});
            }
        }

        // Drop matchers for anything no longer actively watched, so a later re-enable primes fresh
        // instead of diffing against a match set frozen from before it was turned off.
        for (const id of matchers.keys()) {
            if (!activeIds.has(id)) matchers.delete(id);
        }
    });

    onCleanup(() => matchers.clear());
}
