/** Layout pieces shared by the settings pages: sections of rows inside bordered cards, and a segmented button control. */
import type {IconTypes} from "solid-icons";
import {children, For, type JSX, Show} from "solid-js";

function SectionHeading(props: {title: JSX.Element; description?: JSX.Element}) {
    const description = children(() => props.description);
    return (
        <div>
            <h2 class="text-base font-semibold">{props.title}</h2>
            <Show when={description()}>
                <p class="text-sm text-muted-foreground">{description()}</p>
            </Show>
        </div>
    );
}

/** A card holding rows or free-form content. */
export function SettingsCard(props: {title?: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    const title = children(() => props.title);
    const description = children(() => props.description);
    return (
        <div class="rounded-lg border bg-card p-4 flex flex-col gap-4">
            <Show when={title() || description()}>
                <div>
                    <Show when={title()}><h3 class="text-sm font-semibold">{title()}</h3></Show>
                    <Show when={description()}><p class="text-xs text-muted-foreground">{description()}</p></Show>
                </div>
            </Show>
            {props.children}
        </div>
    );
}

/** A headed section with one card. `title`/`description` are JSX so callers can pass `<Trans>` directly. */
export function SettingsSection(props: {title: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    return (
        <section class="flex flex-col gap-3">
            <SectionHeading title={props.title} description={props.description}/>
            <SettingsCard>{props.children}</SettingsCard>
        </section>
    );
}

/** A headed section whose children are their own cards (`SettingsCard` or any other card). */
export function SettingsGroup(props: {title: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    return (
        <section class="flex flex-col gap-3">
            <SectionHeading title={props.title} description={props.description}/>
            {props.children}
        </section>
    );
}

export function SettingsRow(props: {label: JSX.Element; description?: JSX.Element; children: JSX.Element}) {
    const description = children(() => props.description);
    return (
        <div class="flex flex-row items-center justify-between gap-4">
            <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium">{props.label}</span>
                <Show when={description()}>
                    <span class="text-xs text-muted-foreground">{description()}</span>
                </Show>
            </div>
            <div class="shrink-0">{props.children}</div>
        </div>
    );
}

export function ButtonGroup<T extends string>(props: {
    // `label` is a plain string, not JSX: it is used as `title`/`aria-label` as well as visible
    // text, so callers resolve it with `useLingui()._(msg\`…\`)` rather than wrapping in <Trans>.
    options: {value: T; icon: IconTypes; label: string}[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div class="flex flex-col sm:flex-row rounded-md border border-input overflow-hidden">
            <For each={props.options}>
                {(opt) => (
                    <button
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={props.value === opt.value}
                        class={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors
                            ${props.value === opt.value
                                ? "bg-primary text-primary-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }
                            not-last:border-r not-last:border-input`}
                        onClick={() => props.onChange(opt.value)}
                    >
                        {opt.icon({class: "size-4 shrink-0"})}
                        <span>{opt.label}</span>
                    </button>
                )}
            </For>
        </div>
    );
}
