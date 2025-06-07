import Nav from "~/components/Nav";
import {JSX, Suspense} from "solid-js";
import {cn} from "~/lib/utils";

interface LayoutProps {
    title: string;
    children?: JSX.Element;
    secondaryNav?: JSX.Element;
    wrapperClasses?: string
}

export default function MainLayout(props: LayoutProps) {
    return (
        <div class="w-full h-full flex flex-col">
            <Nav title={props.title}>
                {props.secondaryNav}
            </Nav>
            <Suspense>
                <main class={cn(`overflow-auto pb-2 pt-4 grow`, props.wrapperClasses)}>
                    {props.children}
                </main>
                <footer class={"mt-auto text-muted-foreground text-center"}>
                    <p></p>
                </footer>
            </Suspense>
        </div>
    )
}