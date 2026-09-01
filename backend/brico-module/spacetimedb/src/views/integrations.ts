// noinspection JSUnusedGlobalSymbols

import {t} from 'spacetimedb/server';
import {spacetimedb} from '../schema';
import {integration_link_request, linked_integration} from '../tables/integrations';

/** The caller's own integration links, revoked ones included (client decides what to show). */
export const myLinkedIntegration = spacetimedb.view(
    {name: 'my_linked_integration', public: true},
    t.array(linked_integration.rowType),
    ctx => ctx.from.linked_integration.where(l => l.accountIdentity.eq(ctx.sender))
);

/** Unfiltered integration feed for brico-bot. Service principals only, same trusted-constant-predicate query view as `all_account`. */
export const allLinkedIntegration = spacetimedb.view(
    {name: 'all_linked_integration', public: true},
    t.array(linked_integration.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.linked_integration.where(_ => isTrusted);
    }
);

/**
 * The caller's own pending link request(s), so the browser can show "waiting for confirmation..."
 * UI while a browser-initiated link (BitAuth, Stelo) is out for verification. A bot-initiated
 * request (Discord `/link`) only ever has `accountIdentity` set for the instant between
 * `claimIntegrationLink` and finalization, so it never lingers here.
 *
 * Procedural, not a query view: `accountIdentity` is `t.option(t.identity())` (unset until a
 * bot-initiated request is claimed), and the query builder's `.eq(ctx.sender)` on an optional
 * identity column does not match rows at all — verified against a live local instance, rows that
 * plainly matched at the SQL/table level never reached this view. `accountIdentity.filter(ctx.sender)`
 * against the same index does match correctly.
 */
export const myIntegrationLinkRequest = spacetimedb.view(
    {name: 'my_integration_link_request', public: true},
    t.array(integration_link_request.rowType),
    ctx => [...ctx.db.integration_link_request.accountIdentity.filter(ctx.sender)]
);

/** Unfiltered pending-link feed for brico-bot (e.g. Stelo candidate submissions awaiting its verification). Same trusted-constant-predicate query view as `all_account`. */
export const allIntegrationLinkRequest = spacetimedb.view(
    {name: 'all_integration_link_request', public: true},
    t.array(integration_link_request.rowType),
    ctx => {
        const isTrusted = ctx.db.service_principal.identity.find(ctx.sender) !== null;
        return ctx.from.integration_link_request.where(_ => isTrusted);
    }
);
