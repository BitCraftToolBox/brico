import type {Table} from "@tanstack/solid-table"

import {TbX as IconX} from "solid-icons/tb"
import {Button} from "~/components/ui/button"
import {TextField, TextFieldInput} from "~/components/ui/text-field"

import {TableFacetedFilter, TableFacetedFilterProps} from "./table-faceted-filter"
import {TableViewOptions} from "./table-view-options"
import {For, Show} from "solid-js";
import {ensurePagesVisible} from "~/lib/utils";

type DataTableToolbarProps<TData> = {
    table: Table<TData>
    filters?: TableFacetedFilterProps<TData>[]
    searchColumn?: string
}

export function TableToolbar<TData>(props: DataTableToolbarProps<TData>) {
    const isFiltered = () => props.table.getState().columnFilters.length > 0;

    return (
        <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
                <div class="flex flex-1 items-center space-x-2">
                    <Show when={props.searchColumn}>
                        <TextField
                            value={(props.table.getColumn(props.searchColumn!)?.getFilterValue() as string) ?? ""}
                            onChange={(value) => {
                                props.table.getColumn(props.searchColumn!)?.setFilterValue(value);
                                ensurePagesVisible(props.table);
                            }}
                        >
                            <TextFieldInput placeholder="Search..." class="h-8 w-[150px] lg:w-[250px]"/>
                        </TextField>
                    </Show>
                    {isFiltered() && (
                        <Button
                            variant="ghost"
                            onClick={() => props.table.resetColumnFilters()}
                            class="h-8 px-2 lg:px-3"
                        >
                            Reset
                            <IconX/>
                        </Button>
                    )}
                </div>
                <TableViewOptions table={props.table}/>
            </div>
            <div class="flex items-center justify-start gap-2">
                <For each={props.filters}>
                    {(filter) => <TableFacetedFilter {...filter} />}
                </For>
            </div>
        </div>
    )
}