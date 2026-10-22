import * as CheckboxPrimitive from "@kobalte/core/checkbox"
import type {PolymorphicProps} from "@kobalte/core/polymorphic"
import type {JSX, ValidComponent} from "solid-js"
import {Match, Show, splitProps, Switch} from "solid-js"

import {cn} from "~/lib/utils"

type CheckboxRootProps<T extends ValidComponent = "div"> =
    CheckboxPrimitive.CheckboxRootProps<T> & { class?: string | undefined, label?: JSX.Element }

/** `label` renders a clickable, accessible label beside the box, top-aligned with its first line. */
const Checkbox = <T extends ValidComponent = "div">(
    props: PolymorphicProps<T, CheckboxRootProps<T>>
) => {
    const [local, others] = splitProps(props as CheckboxRootProps, ["class", "label"])
    return (
        <CheckboxPrimitive.Root
            class={cn("items-top group relative flex space-x-2", local.class)}
            {...others}
        >
            <CheckboxPrimitive.Input class="peer" />
            <CheckboxPrimitive.Control class={cn(local.label && "mt-0.5", "size-4 shrink-0 rounded-sm border border-primary ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 data-[checked]:border-none data-[indeterminate]:border-none data-[checked]:bg-primary data-[indeterminate]:bg-primary data-[checked]:text-primary-foreground data-[indeterminate]:text-primary-foreground")}>
                <CheckboxPrimitive.Indicator>
                    <Switch>
                        <Match when={!others.indeterminate}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="size-4"
                            >
                                <path d="M5 12l5 5l10 -10" />
                            </svg>
                        </Match>
                        <Match when={others.indeterminate}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="size-4"
                            >
                                <path d="M5 12l14 0" />
                            </svg>
                        </Match>
                    </Switch>
                </CheckboxPrimitive.Indicator>
            </CheckboxPrimitive.Control>
            <Show when={local.label}>
                <CheckboxPrimitive.Label class="cursor-pointer text-sm group-data-disabled:cursor-not-allowed group-data-disabled:opacity-70">
                    {local.label}
                </CheckboxPrimitive.Label>
            </Show>
        </CheckboxPrimitive.Root>
    )
}

export { Checkbox }