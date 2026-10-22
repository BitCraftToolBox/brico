/**
 * coalesce.ts — "rebuild at most once per interval, and only if something changed".
 *
 * The frontend's craft relay reaches for `@solid-primitives/scheduled`'s `throttle` for this;
 * the reason is the same here and not framework-specific.
 *
 * Differs from a plain throttle in one way that matters for a service: the timer is a single
 * long-lived interval that skips ticks when nothing is dirty, rather than a timer armed per burst.
 * An idle bridge then does no work at all instead of churning timers.
 */

export interface Coalescer {
    /** Something changed; the next tick should rebuild. Cheap — safe to call per row callback. */
    mark(): void;
    /** Rebuild immediately and clear the dirty flag (used on `onApplied`). */
    flush(): void;
    start(): void;
    stop(): void;
}

export function createCoalescer(run: () => void, intervalMs: number): Coalescer {
    let dirty = false;
    let timer: NodeJS.Timeout | null = null;

    return {
        mark() {
            dirty = true;
        },
        flush() {
            dirty = false;
            run();
        },
        start() {
            if (timer !== null) return;
            timer = setInterval(() => {
                if (!dirty) return;
                dirty = false;
                run();
            }, intervalMs);
        },
        stop() {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
            dirty = false;
        },
    };
}
