import {ColorModeProvider, ColorModeScript} from "@kobalte/core"
import {I18nProvider} from "@lingui/solid";
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
import {setActiveDataLocale} from "~/lib/data-translation";
import {GlobalSearchProvider} from "~/lib/global-search-context";
import {activateUILocale, i18n} from "~/lib/i18n";
import {KEYS, SettingsProvider, useSettings} from "~/lib/settings";
import {useGameDataReady, useLoadingProgress} from "~/lib/spacetime";

/** Inner wrapper — needs to be a child of SettingsProvider so useSettings() resolves */
function AppRoot(props: { children: any }) {
    const {
        sidebarStartsCollapsed, colorStorageManager, midnightDark,
        resolvedUILocale, resolvedDataLocale,
    } = useSettings();

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

    // Bridge the persisted preferences into the two module-level locale states: Lingui's active
    // catalog and the signal BitCraftTable reads. Both are guarded against ever being written on
    // the server (a warm Cloudflare isolate serves interleaved requests), and effects never run
    // there — see the invariant on `activeDataLocale` in data-translation.ts.
    //
    // Neither switch takes visible effect until its translations have loaded: `activateUILocale`
    // awaits the catalog chunk before activating, and `setActiveDataLocale` only requests the
    // locale, which is promoted once its CSV parses. So a language change repaints once, in the
    // target language, rather than flashing English in between.
    createEffect(() => void activateUILocale(resolvedUILocale()));
    createEffect(() => setActiveDataLocale(resolvedDataLocale()));

    return (
        <>
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
                    <I18nProvider i18n={i18n}>
                        <SettingsProvider>
                            <AppRoot>{props.children}</AppRoot>
                        </SettingsProvider>
                    </I18nProvider>
                </MetaProvider>
            )}
        >
            <FileRoutes/>
        </Router>
    );
}
