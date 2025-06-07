import type { ComponentProps } from "solid-js"
import { Match, Show, Switch } from "solid-js"

import type { Column } from "@tanstack/solid-table"

import { TbArrowDown as IconArrowDown, TbArrowUp as IconArrowUp, TbEyeClosed as IconEyeOff, TbSelector as IconSelector } from "solid-icons/tb"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "~/components/ui/dropdown-menu"

type TableColumnHeaderProps<TData> = ComponentProps<"div"> & {
    column: Column<TData>
    title: string
}

export function TableColumnHeader<TData>(props: TableColumnHeaderProps<TData>) {
    return (
        <Show
            when={props.column.getCanSort()}
            fallback={<div class={cn(props.class)}>{props.title}</div>}
        >
            <div class={cn("flex items-center space-x-2", props.class)}>
                <DropdownMenu placement="bottom-start">
                    <DropdownMenuTrigger
                        as={Button<"button">}
                        variant="ghost"
                        size="sm"
                        class="-ml-3 h-8 data-[expanded]:bg-accent"
                    >
                        <span>{props.title}</span>
                        <Switch fallback={<IconSelector />}>
                            <Match when={props.column.getIsSorted() === "desc"}>
                                <IconArrowDown />
                            </Match>
                            <Match when={props.column.getIsSorted() === "asc"}>
                                <IconArrowUp />
                            </Match>
                        </Switch>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => props.column.toggleSorting(false)}>
                            <IconArrowUp class="size-3.5 text-muted-foreground/70" />
                            Asc
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => props.column.toggleSorting(true)}>
                            <IconArrowDown class="size-3.5 text-muted-foreground/70" />
                            Desc
                        </DropdownMenuItem>
                        <Show when={props.column.getCanHide()}>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => props.column.toggleVisibility(false)}>
                                <IconEyeOff class="size-3.5 text-muted-foreground/70" />
                                Hide
                            </DropdownMenuItem>
                        </Show>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </Show>
    )
}