import { For } from "solid-js"

import type { Table } from "@tanstack/solid-table"

import { TbSettings as IconSettings } from "solid-icons/tb"
import { Button } from "~/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "~/components/ui/dropdown-menu"

type TableViewOptionsProps<TData> = {
    table: Table<TData>
}

export function TableViewOptions<TData>(props: TableViewOptionsProps<TData>) {
    return (
        <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
                as={Button<"button">}
                variant="outline"
                size="sm"
                class="h-8 w-auto px-2 sm:px-3"
            >
                <IconSettings />
                View
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-[150px]">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <For
                    each={props.table
                        .getAllColumns()
                        .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())}
                >
                    {(column) => (
                        <DropdownMenuCheckboxItem
                            checked={column.getIsVisible()}
                            onChange={(value) => column.toggleVisibility(value)}
                        >
                            {column.id}
                        </DropdownMenuCheckboxItem>
                    )}
                </For>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}