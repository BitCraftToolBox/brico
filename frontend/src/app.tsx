import {HashRouter} from "@solidjs/router";
import {FileRoutes} from "@solidjs/start/router";
import "@fontsource/inter/latin";
import "./app.css";
import {ColorModeProvider, ColorModeScript, localStorageManager} from "@kobalte/core"
import {SidebarProvider} from "~/components/ui/sidebar";
import {AppSidebar} from "~/components/app-sidebar"
import {Dialog, DialogContent} from "~/components/ui/dialog";
import {createSignal} from "solid-js";
import {DetailDialogContext} from "~/lib/contexts";
import {renderDialog} from "~/components/details/renderer";


export default function App() {
    const colorModeStorage = localStorageManager;
    const [dialogOpen, setDialogOpen] = createSignal(false);
    const [dialogContent, setDialogContent] = createSignal<[string, any]>(["", null]);
    const dialogContext = {
        open: dialogOpen, setOpen: setDialogOpen, content: dialogContent, setContent: setDialogContent
    }

    return (
        <HashRouter
            root={props => (
                <>
                    <ColorModeScript storageType={colorModeStorage.type}/>
                    <ColorModeProvider storageManager={colorModeStorage}>
                        <DetailDialogContext.Provider value={dialogContext}>
                            <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
                                <SidebarProvider>
                                    <AppSidebar/>
                                    {props.children}
                                </SidebarProvider>
                                <DialogContent class="max-w-[80vw] max-h-[80vh] w-auto">
                                    {renderDialog(dialogContent())}
                                </DialogContent>
                            </Dialog>
                        </DetailDialogContext.Provider>
                    </ColorModeProvider>
                </>
            )}
        >
            <FileRoutes/>
        </HashRouter>
    );
}
