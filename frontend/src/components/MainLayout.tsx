import {Title} from "@solidjs/meta";
import {JSX, Suspense} from "solid-js";
import Nav from "~/components/Nav";
import {cn} from "~/lib/utils";
import {useIsMobile} from "./ui/sidebar";

interface LayoutProps {
    title: string;
    navTitle?: JSX.Element;
    children?: JSX.Element;
    wrapperClasses?: string;
    hideSearch?: boolean;
}

export default function MainLayout(props: LayoutProps) {
    const isMobile = useIsMobile();
    const title = props.title;

    return (
        <div class="relative flex flex-col w-full h-dvh overflow-hidden">
            <Title>{title} - Brico's Toolbox</Title>
            <Nav title={props.navTitle ?? props.title} hideSearch={props.hideSearch}/>
            <div class="h-10 w-full bg-muted text-muted-foreground flex flex-col items-center justify-center">
                <span>BitCraft EA1 Archive - See current data at <a href="https://brico.app" class="underline">Brico.app</a>.</span>
            </div>
            <div class="flex flex-1 min-h-0">
                <Suspense>
                    <main
                        class={cn(
                            "flex-1 overflow-auto pb-2 pt-4",
                            isMobile() ? "max-w-screen-sm mx-auto px-2" : "px-4",
                            props.wrapperClasses
                        )}
                    >
                        {props.children}
                    </main>
                </Suspense>
            </div>
        </div>
    );
}
