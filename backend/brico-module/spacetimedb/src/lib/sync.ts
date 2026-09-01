import type {Timestamp} from 'spacetimedb';
import type {Ctx} from '../schema';

const MAX_CLOCK_SKEW_MICROS = 5n * 60n * 1_000_000n;

/**
 * Clamps a client-supplied `updatedAt` to `ctx.timestamp` if it's more than ~5 minutes ahead of
 * the server clock, so a broken client clock can't permanently win every future LWW comparison.
 * The client's own timestamp is trusted otherwise (not replaced outright) so a client's offline
 * edit ordering is preserved across a multi-device sync.
 */
export function clampClientTimestamp(ctx: Ctx, supplied: Timestamp): Timestamp {
    const maxAllowed = ctx.timestamp.microsSinceUnixEpoch + MAX_CLOCK_SKEW_MICROS;
    return supplied.microsSinceUnixEpoch > maxAllowed ? ctx.timestamp : supplied;
}

/** Server-side LWW guard: only a `candidate` at least as new as `existing` may apply. */
export function isAtLeastAsNew(candidate: Timestamp, existing: Timestamp): boolean {
    return candidate.microsSinceUnixEpoch >= existing.microsSinceUnixEpoch;
}
