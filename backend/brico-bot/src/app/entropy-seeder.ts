/**
 * entropy-seeder.ts — tops up `brico-app`'s `api_key_entropy` pool with bytes from Node's CSPRNG.
 * The module has no secure randomness of its own; `createApiKey` consumes one chunk per key.
 */
import {randomBytes} from "node:crypto";
import type {Logger} from "../log.ts";
import {timeReducerCall} from "../metrics.ts";
import type {BricoAppConnection} from "./connection.ts";

/** Hex length of one chunk; must match the module's `API_KEY_ENTROPY_HEX_LENGTH`. */
const CHUNK_BYTES = 32;
/** Chunks per call. The module drops whatever exceeds its pool cap, so over-sending is harmless. */
const CHUNKS_PER_CALL = 8;

export interface EntropySeeder {
    stop: () => void;
}

export function startEntropySeeder(app: BricoAppConnection, log: Logger, intervalMs: number): EntropySeeder {
    const scoped = log.child("entropy");

    const seed = () => {
        const conn = app.connection?.connection;
        if (!conn?.isActive || !app.isLive) return;
        const chunks = Array.from({length: CHUNKS_PER_CALL}, () => randomBytes(CHUNK_BYTES).toString("hex"));
        timeReducerCall("seed_api_key_entropy", conn.reducers.seedApiKeyEntropy({chunks})).catch(cause => {
            scoped.warn("seeding api key entropy failed", {error: cause instanceof Error ? cause.message : String(cause)});
        });
    };

    const first = setTimeout(seed, 5_000);
    const timer = setInterval(seed, intervalMs);
    first.unref();
    timer.unref();
    return {
        stop: () => {
            clearTimeout(first);
            clearInterval(timer);
        },
    };
}
