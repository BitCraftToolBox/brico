import {ColorModeProvider, ColorModeScript} from "@kobalte/core"
import {MetaProvider} from "@solidjs/meta";
import {Router} from "@solidjs/router";
import {FileRoutes} from "@solidjs/start/router";
import "@fontsource-variable/inter/wght.css";
import "./app.css";
import {createEffect, Show, Suspense} from "solid-js";
import {getRequestEvent, isServer} from "solid-js/web";
import {AppSidebar} from "~/components/app-sidebar"
import AppLoadingScreen from "~/components/AppLoadingScreen";
import {SidebarProvider} from "~/components/ui/sidebar";
import {isBotUserAgent} from "~/lib/bot-detect";
import {GlobalSearchProvider} from "~/lib/global-search-context";
import {KEYS, SettingsProvider, useSettings} from "~/lib/settings";
import {useGameDataReady, useLoadingProgress} from "~/lib/spacetime";

/**
 * Pre-hydration script, run before ColorModeScript so its theme migration below applies
 * first. Does two things before the app renders:
 * 1. Migrates a legacy JSON-encoded `theme` value (e.g. `"dark"`, written before
 *    `persistThemeRaw` existed) to the raw unquoted string ColorModeScript expects.
 * 2. Sets `data-midnight-dark` on <html> from localStorage, so the midnight-dark styling
 *    (app.css) doesn't flash in only after hydration's `createEffect` in AppRoot runs.
 */
function PreHydrationScript() {
    const src = `!function(){try{var t=localStorage.getItem("${KEYS.theme}");if(t&&t.charAt(0)==='"'){var p=JSON.parse(t);if(typeof p==="string")localStorage.setItem("${KEYS.theme}",p)}}catch(e){}try{var v=localStorage.getItem("${KEYS.midnightDark}");if(JSON.parse(v||"false"))document.documentElement.setAttribute("data-midnight-dark","")}catch(e){}}();`;
    return <script id="pre-hydration-script" innerHTML={src}/>;
}

/** Inner wrapper — needs to be a child of SettingsProvider so useSettings() resolves */
function AppRoot(props: { children: any }) {
    const { sidebarStartsCollapsed, colorStorageManager, midnightDark } = useSettings();

    // `allReady` gates the app UI behind a loading screen until every table has settled, and
    // also triggers the client-side search index build. For bots the data is already loaded at
    // render time (server: middleware preload; client: preloaded before hydration), so the gate
    // is already open on first render and never visibly triggers. For humans, it covers the brief
    // client-side data fetch kicked off in entry-client, exactly like the pre-SSR app did.
    const allReady = useGameDataReady();
    const loadingProgress = useLoadingProgress();

    createEffect(() => {
        if (midnightDark()) {
            document.documentElement.setAttribute("data-midnight-dark", "");
        } else {
            document.documentElement.removeAttribute("data-midnight-dark");
        }
    });

    return (
        <>
            <PreHydrationScript/>
            <ColorModeScript storageType="localStorage" storageKey={KEYS.theme}/>
            <ColorModeProvider storageManager={colorStorageManager}>
                <GlobalSearchProvider isReady={allReady}>
                    <Show when={allReady()} fallback={<AppLoadingScreen {...loadingProgress()}/>}>
                        <SidebarProvider defaultOpen={!sidebarStartsCollapsed()}>
                            <AppSidebar/>
                            <Suspense>
                                {props.children}
                            </Suspense>
                        </SidebarProvider>
                    </Show>
                </GlobalSearchProvider>
            </ColorModeProvider>
        </>
    );
}

export default function App() {
    const isBot = isServer
        ? isBotUserAgent(getRequestEvent()?.request.headers.get("user-agent"))
        : isBotUserAgent(navigator.userAgent);

    // Dynamic rendering split: bots get the full SSR tree below (canonical default UI state,
    // real content and links). For humans the server renders an empty #app — exactly what
    // SolidStart's ssr:false preset ships. The client mounts fresh via render() (entry-client.tsx),
    // applying localStorage prefs from its first paint just like the pre-SSR SPA did.
    if (isServer && !isBot) {
        return null;
    }

    return (
        <Router
            root={props => (
                <MetaProvider>
                    <SettingsProvider>
                        <AppRoot>{props.children}</AppRoot>
                    </SettingsProvider>
                </MetaProvider>
            )}
        >
            <FileRoutes/>
        </Router>
    );
}
