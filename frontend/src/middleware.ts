import {createMiddleware} from "@solidjs/start/middleware";
import {isBotUserAgent} from "~/lib/bot-detect";
import {preloadAllTablesServer} from "~/lib/spacetime";

/**
 * Server middleware: classify the requester (bot vs. human) and, for bots only, ensure the full
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
        const isBot =
            event.request.headers.get("x-known-bot") === "true" ||
            isBotUserAgent(event.request.headers.get("user-agent"));
        event.locals.isBot = isBot;
        if (isBot) {
            const origin = new URL(event.request.url).origin;
            await preloadAllTablesServer(origin);
        }
    },
});
