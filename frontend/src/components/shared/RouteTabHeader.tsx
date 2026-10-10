import {A} from "@solidjs/router";
import {For, type JSX, Show} from "solid-js";

export interface RouteTab {
    label: JSX.Element;
    href: string;
}

/**
 * A page's `<h1>` plus a row of underlined nav tabs that navigate to real, separate routes (`A`),
 * styled after `DetailPageLayout`'s `PseudoTabLink` but keyed off the current URL instead of local
 * state — for a set of pages that are conceptually "tabs" of one another (e.g. the account
 * profile/notifications/settings pages) while staying independently linkable/bookmarkable.
 *
 * `status`, when given (a page with a live connection behind it — see `ConnectionStatusBadge`),
 * sits flush right of the title, same placement as the craft browser/detail pages' own heading row.
 */
export default function RouteTabHeader(props: {title: JSX.Element; tabs: RouteTab[]; status?: JSX.Element}) {
    return (
        <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-3">
                <h1 class="text-2xl font-bold">{props.title}</h1>
                <Show when={props.status}>
                    <div class="ml-auto flex flex-row gap-2">{props.status}</div>
                </Show>
            </div>
            <nav class="flex gap-4 border-b">
                <For each={props.tabs}>
                    {tab => (
                        <A
                            href={tab.href}
                            end
                            class="pb-2 text-sm border-b-2 transition-colors"
                            activeClass="border-foreground text-foreground font-medium"
                            inactiveClass="border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                        >
                            {tab.label}
                        </A>
                    )}
                </For>
            </nav>
        </div>
    );
}
