import Nav from "~/components/Nav";
import { JSX, Suspense } from "solid-js";
import { cn } from "~/lib/utils";
import { Title } from "@solidjs/meta";
import { useIsMobile } from "./ui/sidebar";

interface LayoutProps {
    title: string;
    children?: JSX.Element;
    secondaryNav?: JSX.Element;
    wrapperClasses?: string;
}

export default function MainLayout(props: LayoutProps) {
    const isMobile = useIsMobile();

    return (
        <div class="relative w-full overflow-x-clip">
            <Title>{props.title} - Brico's Toolbox</Title>
            <Nav title={props.title}>{props.secondaryNav}</Nav>
            <div class="flex w-full justify-between gap-2">
                <Suspense>
                    <main
                        class={cn(
                            "overflow-auto pb-2 pt-4 grow",
                            isMobile() ? "max-w-screen-sm mx-auto px-2" : "px-4",
                            props.wrapperClasses
                        )}
                    >
                        {props.children}
                    </main>
                    <footer class={"mt-auto text-muted-foreground text-center"}>
                        <p></p>
                    </footer>
                </Suspense>
            </div>
        </div>
    );
}
