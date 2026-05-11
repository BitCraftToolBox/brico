import {ColorModeProvider, ColorModeScript} from "@kobalte/core"
import {MetaProvider} from "@solidjs/meta";
import {Router} from "@solidjs/router";
import {FileRoutes} from "@solidjs/start/router";
import "@fontsource/inter/latin";
import "./app.css";
import {Show} from "solid-js";
import {AppSidebar} from "~/components/app-sidebar"
import AppLoadingScreen from "~/components/AppLoadingScreen";
import {SidebarProvider} from "~/components/ui/sidebar";
import {SettingsProvider, useSettings} from "~/lib/settings";
import {useGameDataReady, useLoadingProgress} from "~/lib/spacetime";


/** Inner wrapper — needs to be a child of SettingsProvider so useSettings() resolves */
function AppRoot(props: { children: any }) {
    const { sidebarStartsCollapsed, colorStorageManager } = useSettings();
    const isReady = useGameDataReady();
    const progress = useLoadingProgress();

    return (
        <>
            <ColorModeScript storageType="localStorage" storageKey="brico:theme"/>
            <ColorModeProvider storageManager={colorStorageManager}>
                <Show when={!isReady()}>
                    <AppLoadingScreen loaded={progress().loaded} total={progress().total}/>
                </Show>
                <Show when={isReady()}>
                    <SidebarProvider defaultOpen={!sidebarStartsCollapsed()}>
                        <AppSidebar/>
                        {props.children}
                    </SidebarProvider>
                </Show>
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
