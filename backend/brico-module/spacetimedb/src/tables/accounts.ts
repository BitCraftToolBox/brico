import {t, table} from 'spacetimedb/server';

/** A brico account: one row per SpacetimeAuth-authenticated identity. */
export const account = table(
    {
        name: 'account',
        indexes: [
            // brico-bot holds raw ID tokens and resolves (iss, sub) -> account with this.
            {
                accessor: 'by_issuer_subject',
                algorithm: 'btree',
                columns: ['issuer', 'subject'],
            },
        ],
    },
    {
        /** `ctx.sender` — derived by SpacetimeDB from the ID token's `iss` + `sub`. */
        identity: t.identity().primaryKey(),
        /** `iss` claim of the token that opened the connection (e.g. SpacetimeAuth's issuer). */
        issuer: t.string(),
        /** `sub` claim — the provider's stable user id. */
        subject: t.string(),
        /** Optional user-chosen display name. Never populated from PII claims. */
        displayName: t.option(t.string()),
        createdAt: t.timestamp(),
        lastSeenAt: t.timestamp(),
    }
);

/**
 * Identities allowed to read `all_` views and write privileged information.
 */
export const service_principal = table(
    {name: 'service_principal'},
    {
        identity: t.identity().primaryKey(),
        label: t.string(),
        grantedAt: t.timestamp(),
    }
);
