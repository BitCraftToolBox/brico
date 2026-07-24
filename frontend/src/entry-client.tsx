// @refresh reload
import {mount, StartClient} from "@solidjs/start/client";
import {render} from "solid-js/web";
import {isBotUserAgent} from "~/lib/bot-detect";
import {preloadAllTablesClient} from "~/lib/spacetime";

const el = document.getElementById("app")!;

if (isBotUserAgent(navigator.userAgent)) {
    // The server rendered real content for this UA, so load + parse the full dataset before
    // hydrating: the first client render then matches the server HTML exactly (clean hydration,
    // no mismatch). Real <a> links still work as full-page navigations during this window.
    preloadAllTablesClient().finally(() => mount(() => <StartClient/>, el));
} else {
    // The server sent an empty #app for this UA (app.tsx returns null), so there's nothing to
    // hydrate against. render() does a fresh client-only mount — the same call SolidStart's
    // built-in ssr:false preset uses internally — with no hydration markers to match, so nothing
    // can mismatch and no server DOM is left layered over the app. Kick the data fetch off in
    // parallel; AppRoot's loading gate covers the wait.
    void preloadAllTablesClient();
    render(() => <StartClient/>, el);
}
