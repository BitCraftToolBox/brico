import type {Column, Table} from "@tanstack/solid-table"

import {TbOutlineArrowDown as IconArrowDown, TbOutlineArrowUp as IconArrowUp, TbOutlineEyeClosed as IconEyeOff, TbOutlineSelector as IconSelector} from "solid-icons/tb"
import type {ComponentProps} from "solid-js"
import {Match, Show, Switch} from "solid-js"
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {useSettings} from "~/lib/settings";
import {cn} from "~/lib/utils"

type TableColumnHeaderProps<TData> = ComponentProps<"div"> & {
    column: Column<TData>
    title: string
    table: Table<TData>
}

export function TableColumnHeader<TData>(props: TableColumnHeaderProps<TData>) {
    const { tableHiddenColumns, setTableHiddenColumns } = useSettings();
    const name = props.table.options.meta?.["name"];
    const colId = props.column.id;
    const hideColumn = () => {
        props.column.toggleVisibility(false);
        if (!name) return;
        const current = tableHiddenColumns()[name] ?? [];
        setTableHiddenColumns({
            ...tableHiddenColumns(),
            [name]: current.includes(colId) ? current : [...current, colId],
        });
    };

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
                        <Show when={props.children} fallback={<span>{props.title}</span>}>
                            {props.children}
                        </Show>
                        <Switch fallback={<IconSelector/>}>
                            <Match when={props.column.getIsSorted() === "desc"}>
                                <IconArrowDown/>
                            </Match>
                            <Match when={props.column.getIsSorted() === "asc"}>
                                <IconArrowUp/>
                            </Match>
                        </Switch>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => props.column.toggleSorting(false)}>
                            <IconArrowUp class="size-3.5 text-muted-foreground/70"/>
                            Asc
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => props.column.toggleSorting(true)}>
                            <IconArrowDown class="size-3.5 text-muted-foreground/70"/>
                            Desc
                        </DropdownMenuItem>
                        <Show when={props.column.getCanHide()}>
                            <DropdownMenuSeparator/>
                            <DropdownMenuItem onClick={hideColumn}>
                                <IconEyeOff class="size-3.5 text-muted-foreground/70"/>
                                Hide
                            </DropdownMenuItem>
                        </Show>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </Show>
    )
}