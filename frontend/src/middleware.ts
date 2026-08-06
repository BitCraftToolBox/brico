import {createMiddleware} from "@solidjs/start/middleware";
import {isBotUserAgent} from "~/lib/bot-detect";
import {preloadAllTablesServer} from "~/lib/spacetime";

/**
 * Item-derived detail families that no longer have a page of their own. Each of these descs is keyed
 * by `itemId`, so the id in the URL is already the item's — the redirect is a pure path rewrite,
 * needing no table data, and so is served identically to every requester.
 *
 * They were removed because the item page renders a strict superset of what each of them showed
 * (see the note in sitemap.xml.ts), which had them competing with the canonical item page for the
 * same searches. A 301 is what keeps existing links, bookmarks, and Google's index working while
 * consolidating the ranking signals onto one URL — better than a canonical tag, which leaves the
 * duplicate URL live and crawlable.
 */
const REDIRECTED_ITEM_FAMILIES = ["tool", "food", "weapon", "equipment"];
const ITEM_FAMILY_PATH = new RegExp(`^/database/(?:${REDIRECTED_ITEM_FAMILIES.join("|")})/([^/]+)/?$`);

/**
 * Server middleware: redirect the consolidated item-derived families above, then classify the
 * requester (bot vs. human) and, for bots only, ensure the full
 * BSATN dataset is parsed and memoized for this isolate before the page renders. The preload is
 * idempotent, so only the first bot request per warm isolate actually fetches/parses; later ones
 * await an already-resolved promise.
 *
 * Humans skip the preload entirely — they get a throwaway placeholder from the server (app.tsx)
 * and mount fresh on the client (entry-client.tsx), so paying the SSR data cost for them would be
 * wasted work. `isBot` is stashed on `event.locals` (a permissive index signature per
 * @solidjs/start's env.d.ts) and read back during render via getRequestEvent().
 *
 * Static assets (/bsatn/*, /_build/*) are excluded from SSR via _routes.json and never reach
 * here; the memoized preload keeps any stray invocation cheap regardless.
 */
export default createMiddleware({
    onRequest: async (event) => {
        const url = new URL(event.request.url);
        const itemFamily = ITEM_FAMILY_PATH.exec(url.pathname);
        if (itemFamily) {
            const target = new URL(`/database/item/${itemFamily[1]}`, url);
            target.search = url.search;
            return Response.redirect(target, 301);
        }

        const isBot =
            event.request.headers.get("x-known-bot") === "true" ||
            isBotUserAgent(event.request.headers.get("user-agent"));
        event.locals.isBot = isBot;
        if (isBot) {
            await preloadAllTablesServer(url.origin);
        }
    },
});
