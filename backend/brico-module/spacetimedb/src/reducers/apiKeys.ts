// noinspection JSUnusedGlobalSymbols

import {CraftError, MAX_API_KEY_NAME_LENGTH, MAX_API_KEYS_PER_ACCOUNT} from '@brico/crafts/errors';
import {SenderError, t} from 'spacetimedb/server';
import {API_KEY_ENTROPY_HEX_LENGTH, generateApiToken, hashApiToken, MAX_API_KEY_ENTROPY_CHUNKS, takeApiKeyEntropy} from '../lib/apiKeys';
import {requireAccount, requireServicePrincipal} from '../lib/auth';
import {spacetimedb} from '../schema';

const CreateApiKeyResult = t.object('CreateApiKeyResult', {
    id: t.u64(),
    /** The bearer token. Returned only here: the module stores just its hash. */
    token: t.string(),
});

/** Mints an API key for the caller's own account. */
export const createApiKey = spacetimedb.procedure(
    {name: t.string(), readPayouts: t.bool(), publicDashboard: t.bool()},
    CreateApiKeyResult,
    (ctx, {name, readPayouts, publicDashboard}) => {
        const trimmed = name.trim();
        if (trimmed === '' || trimmed.length > MAX_API_KEY_NAME_LENGTH) {
            throw new SenderError(CraftError.INVALID_API_KEY_NAME);
        }

        return ctx.withTx(tx => {
            requireAccount(tx);
            if ([...tx.db.api_key.accountIdentity.filter(tx.sender)].length >= MAX_API_KEYS_PER_ACCOUNT) {
                throw new SenderError(CraftError.TOO_MANY_API_KEYS);
            }

            const token = generateApiToken(tx.random, takeApiKeyEntropy(tx));
            const row = tx.db.api_key.insert({
                id: 0n,
                accountIdentity: tx.sender,
                name: trimmed,
                tokenHash: hashApiToken(token),
                createdAt: tx.timestamp,
                readPayouts,
                publicDashboard,
            });
            return {id: row.id, token};
        });
    }
);

/**
 * Service principal only: adds random chunks (`API_KEY_ENTROPY_HEX_LENGTH` hex chars each) for
 * `createApiKey` to consume. Chunks beyond `MAX_API_KEY_ENTROPY_CHUNKS` unconsumed are dropped, so
 * the caller can top up blindly.
 */
export const seedApiKeyEntropy = spacetimedb.reducer(
    {chunks: t.array(t.string())},
    (ctx, {chunks}) => {
        requireServicePrincipal(ctx);
        let held = ctx.db.api_key_entropy.count();
        for (const bytes of chunks) {
            if (held >= MAX_API_KEY_ENTROPY_CHUNKS) break;
            if (bytes.length !== API_KEY_ENTROPY_HEX_LENGTH || !/^[0-9a-f]+$/.test(bytes)) {
                throw new SenderError(CraftError.INVALID_API_KEY_ENTROPY);
            }
            ctx.db.api_key_entropy.insert({id: 0n, bytes});
            held++;
        }
    }
);

/** Revokes one of the caller's own API keys. */
export const deleteApiKey = spacetimedb.reducer(
    {id: t.u64()},
    (ctx, {id}) => {
        const key = ctx.db.api_key.id.find(id);
        if (key === null || !key.accountIdentity.isEqual(ctx.sender)) {
            throw new SenderError(CraftError.UNKNOWN_API_KEY);
        }
        ctx.db.api_key.id.delete(id);
    }
);
