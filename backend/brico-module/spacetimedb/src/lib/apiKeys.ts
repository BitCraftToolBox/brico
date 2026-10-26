import {CraftError} from '@brico/crafts/errors';
import {sha256} from '@noble/hashes/sha2.js';
import type {Random} from 'spacetimedb/server';
import {SenderError} from 'spacetimedb/server';
import type {Ctx} from '../schema';

const TOKEN_PREFIX = 'brico_';

/** Size of one `api_key_entropy` chunk, and of the token it becomes. */
export const API_KEY_ENTROPY_BYTES = 32;
export const API_KEY_ENTROPY_HEX_LENGTH = API_KEY_ENTROPY_BYTES * 2;
/** Most unconsumed chunks `api_key_entropy` holds; `seedApiKeyEntropy` drops the excess. */
export const MAX_API_KEY_ENTROPY_CHUNKS = 64;

/** Removes and returns the oldest `api_key_entropy` chunk. Single use: a reused chunk would let one leaked token expose the next. */
export function takeApiKeyEntropy(ctx: Ctx): string {
    for (const chunk of ctx.db.api_key_entropy.iter()) {
        ctx.db.api_key_entropy.id.delete(chunk.id);
        return chunk.bytes;
    }
    throw new SenderError(CraftError.ENTROPY_UNAVAILABLE);
}

/**
 * What `api_key.tokenHash` stores: hex SHA-256 of the token. Tokens are 256 random bits, so a
 * plain unsalted hash is enough.
 */
export function hashApiToken(token: string): string {
    return Array.from(sha256(new TextEncoder().encode(token)), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A fresh API token: `brico_` + 64 hex chars. The strength comes entirely from `entropyHex`;
 * `ctx.random` is XORed in only because it costs nothing and cannot weaken it.
 */
export function generateApiToken(random: Random, entropyHex: string): string {
    const mixed = random.fill(new Uint8Array(API_KEY_ENTROPY_BYTES));
    let hex = '';
    for (let i = 0; i < API_KEY_ENTROPY_BYTES; i++) {
        hex += (mixed[i] ^ parseInt(entropyHex.slice(i * 2, i * 2 + 2), 16)).toString(16).padStart(2, '0');
    }
    return TOKEN_PREFIX + hex;
}
