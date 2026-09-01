import {t, table} from 'spacetimedb/server';

/**
 * brico account <-> external system <-> external id.
 * Generalized so all providers share one shape.
 */
export const linked_integration = table(
    {
        name: 'linked_integration',
        indexes: [
            {
                accessor: 'by_provider_external_id',
                algorithm: 'btree',
                columns: ['provider', 'externalId'],
            },
        ],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        accountIdentity: t.identity().index('btree'),
        provider: t.string(),
        /** The external system's stable user id (e.g. a Discord snowflake). */
        externalId: t.string(),
        /** Mutable, display-only handle from the external system, if it exposes one. */
        externalHandle: t.option(t.string()),
        linkedAt: t.timestamp(),
        /** Set instead of deleting the row, so link history is retained. */
        revokedAt: t.option(t.timestamp()),
    }
);

/**
 * A pending link between a brico account and an external identity, filled in from one or both
 * sides before it resolves into a `linked_integration` row. Scheduled removal so an abandoned
 * link (user closes the tab mid-flow, a Discord code never redeemed) cleans itself up rather than
 * accumulating. Shared by every provider needing an out-of-band verification step instead of a
 * bespoke correlation table per provider.
 */
export const integration_link_request = table(
    {
        name: 'integration_link_request',
        indexes: [{accessor: 'accountIdentity', algorithm: 'btree', columns: ['accountIdentity']}],
    },
    {
        id: t.u64().primaryKey().autoInc(),
        /** ~15 minutes out from creation — see `LINK_TTL_MICROS` in `reducers/integrations.ts`. */
        scheduledAt: t.scheduleAt(),
        /** Client- or bot-generated correlation token, e.g. `crypto.randomUUID()`. */
        code: t.string().unique(),
        provider: t.string(),
        /** Filled by the browser side (set at creation for a browser-initiated link, by
         * `claimIntegrationLink` for a bot-initiated one). */
        accountIdentity: t.option(t.identity()),
        /** Filled by the bot side (set at creation for a bot-initiated request, by
         * `noteIntegrationLinkExternal` for a browser-initiated one). */
        externalId: t.option(t.string()),
        externalHandle: t.option(t.string()),
        createdAt: t.timestamp(),
    }
);
