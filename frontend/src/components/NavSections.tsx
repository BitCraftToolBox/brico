import {A} from "@solidjs/router";
import {For} from "solid-js";
import {useLabel} from "~/lib/labels";
import {SIDEBAR_GROUPS} from "~/lib/sidebar-items";

/**
 * Sectioned grid of icon links for a landing page — the sidebar's tree/icon grid view, laid out
 * for full-page browsing instead of the narrow sidebar rail.
 */
export default function NavSections(props: { groups: string[] }) {
    const label = useLabel();
    const groups = () => SIDEBAR_GROUPS.filter(g => props.groups.includes(g.name));

    return (
        <div class="flex flex-col gap-8 max-w-4xl mx-auto w-full">
            <For each={groups()}>
                {(group) => (
                    <section>
                        <h2 class="text-lg font-semibold mb-3 border-b pb-1">{label(group.nameLabel)}</h2>
                        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            <For each={group.items}>
                                {(item) => (
                                    <A
                                        href={item.href}
                                        class={`flex flex-col items-center gap-1.5 rounded-lg p-3 text-center hover:bg-accent/60 transition-colors ${item.disabled ? "text-muted-foreground pointer-events-none" : ""}`}
                                    >
                                        {item.icon({class: "size-10 shrink-0"})}
                                        <span class="text-xs leading-tight line-clamp-2 w-full">{label(item.titleLabel)}</span>
                                    </A>
                                )}
                            </For>
                        </div>
                    </section>
                )}
            </For>
        </div>
    );
}
