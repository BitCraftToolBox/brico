/**
 * inflight.ts — keeps a reducer call from being repeated before its effect has echoed back through
 * the cache, which the next tick would otherwise read as "not done yet".
 */
import type {Logger} from "../log.ts";

export interface InFlight {
    has(key: string): boolean;
    /** Runs `call`'s bookkeeping: `key` stays marked until shortly after the call settles; a rejection is logged, never thrown. */
    track(key: string, call: Promise<unknown>, what: string, fields?: Record<string, string>): void;
}

export function createInFlight(log: Logger, holdMs = 2000): InFlight {
    const keys = new Set<string>();
    return {
        has: key => keys.has(key),
        track(key, call, what, fields = {}) {
            keys.add(key);
            call
                .catch(cause => log.error(`${what} failed`, {...fields, error: cause instanceof Error ? cause.message : String(cause)}))
                .finally(() => setTimeout(() => keys.delete(key), holdMs).unref());
        },
    };
}
