import {ParentProps} from "solid-js"

import type {Row} from "@tanstack/solid-table"

import {TbDots as IconDots} from "solid-icons/tb"
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"

type TableRowActionsProps<TData> = ParentProps<{
    row: Row<TData>
}>

export function TableRowActions<TData>(props: TableRowActionsProps<TData>) {
    return (
        <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
                as={Button<"button">}
                variant="ghost"
                class="flex size-8 p-0 data-[state=open]:bg-muted"
            >
                <IconDots/>
                <span class="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-[160px]">
                {props.children}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}