import {ColorModeProvider, ColorModeScript} from "@kobalte/core"
import {MetaProvider} from "@solidjs/meta";
import {Router, useLocation} from "@solidjs/router";
import {FileRoutes} from "@solidjs/start/router";
import "@fontsource/inter/latin";
import "./app.css";
import {createEffect, createMemo, Show} from "solid-js";
import {AppSidebar} from "~/components/app-sidebar"
import AppLoadingScreen from "~/components/AppLoadingScreen";
import {SidebarProvider} from "~/components/ui/sidebar";
import {GlobalSearchProvider} from "~/lib/global-search-context";
import {SettingsProvider, useSettings} from "~/lib/settings";
import {BitCraftTables, useGameDataReady, useLoadingProgress, useTablesLoading} from "~/lib/spacetime";


/** Inner wrapper — needs to be a child of SettingsProvider so useSettings() resolves */
function AppRoot(props: { children: any }) {
    const { sidebarStartsCollapsed, colorStorageManager, midnightDark } = useSettings();
    const location = useLocation();

    const allReady = useGameDataReady();
    const allProgress = useLoadingProgress();
    const eventsLoading = useTablesLoading(BitCraftTables.ResourceDesc);

    const isEventsRoute = createMemo(() => location.pathname === "/events");
    const isReady = createMemo(() => (isEventsRoute() ? !eventsLoading() : allReady()));
    const progress = createMemo(() => {
        if (isEventsRoute()) {
            return {loaded: eventsLoading() ? 0 : 1, total: 1};
        }
        return allProgress();
    });

    createEffect(() => {
        if (midnightDark()) {
            document.documentElement.setAttribute("data-midnight-dark", "");
        } else {
            document.documentElement.removeAttribute("data-midnight-dark");
        }
    });

    return (
        <>
            <ColorModeScript storageType="localStorage" storageKey="brico:theme"/>
            <ColorModeProvider storageManager={colorStorageManager}>
                <GlobalSearchProvider isReady={allReady}>
                    <Show when={!isReady()}>
                        <AppLoadingScreen loaded={progress().loaded} total={progress().total}/>
                    </Show>
                    <Show when={isReady()}>
                        <SidebarProvider defaultOpen={!sidebarStartsCollapsed()}>
                            <AppSidebar/>
                            {props.children}
                        </SidebarProvider>
                    </Show>
                </GlobalSearchProvider>
            </ColorModeProvider>
        </>
    );
}

export default function App() {
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
