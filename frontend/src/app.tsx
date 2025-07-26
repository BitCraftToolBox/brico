import { HashRouter } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "@fontsource/inter/latin";
import "./app.css";
import { ColorModeProvider, ColorModeScript, localStorageManager } from "@kobalte/core"
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar"
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { createSignal } from "solid-js";
import { DetailDialogContext, UseFullNodeOutputContext } from "~/lib/contexts";
import { renderDialog } from "~/components/details/renderer";
import { MetaProvider } from "@solidjs/meta";

export default function App() {
    const colorModeStorage = localStorageManager;
    const [dialogOpen, setDialogOpen] = createSignal(false);
    const [dialogContent, setDialogContent] = createSignal<[string, any]>(["", null]);
    const dialogContext = {
        open: dialogOpen, setOpen: setDialogOpen, content: dialogContent, setContent: setDialogContent
    }
    const [useFullNode, setUseFullNode] = createSignal(false);
    const fullNodeContext = {
        useFullNode: useFullNode, setUseFullNode: setUseFullNode, toggle: () => setUseFullNode(!useFullNode())
    }

    return (
        <HashRouter
            root={props => (
                <MetaProvider>
                    <ColorModeScript storageType={colorModeStorage.type} />
                    <ColorModeProvider storageManager={colorModeStorage}>
                        <DetailDialogContext.Provider value={dialogContext}>
                            <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
                                <SidebarProvider>
                                    <AppSidebar />
                                    {props.children}
                                </SidebarProvider>
                                <UseFullNodeOutputContext.Provider value={fullNodeContext}>
                                    <DialogContent class="w-[100vw] h-[100vh] max-w-none max-h-none sm:max-w-[80vw] sm:max-h-[80vh] sm:w-auto sm:h-auto
">
                                        {renderDialog(dialogContent())}
                                    </DialogContent>
                                </UseFullNodeOutputContext.Provider>
                            </Dialog>
                        </DetailDialogContext.Provider>
                    </ColorModeProvider>
                </MetaProvider>
            )}
        >
            <FileRoutes />
        </HashRouter>
    );
}
