import {createSignal, For, mergeProps, Show, splitProps} from "solid-js"

import {
    type Column,
    ColumnDef,
    ColumnFiltersState,
    createSolidTable,
    flexRender,
    getCoreRowModel,
    getFacetedMinMaxValues,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    InitialTableState,
    SortingState,
    VisibilityState
} from "@tanstack/solid-table"

import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table"

import {TablePagination} from "./table-pagination"
import {TableToolbar} from "./table-toolbar"
import {
    NumberBasedOption,
    TableFacetedFilterProps,
    ValueBasedOption
} from "~/components/ui/data-table/table-faceted-filter";
import {TableColumnHeader} from "~/components/ui/data-table/table-column-header";

type DataTableProps<TData> = {
    columns: ColumnDef<TData>[]
    data: TData[]
    facetedFilters?: FilterSetupProps<TData>[]
    searchColumn?: string
    initialState?: InitialTableState
}

export type FilterSetupProps<TData> = Omit<TableFacetedFilterProps<TData>, "table" | "column" | "options"> & {
    column?: string
    options: ((col: Column<TData> | undefined) => (ValueBasedOption[] | NumberBasedOption))
        | ValueBasedOption[] | NumberBasedOption
}

export function DataTable<TData>(props: DataTableProps<TData>) {
    const [rowSelection, setRowSelection] = createSignal({})
    const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>({})
    const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>([])
    const [sorting, setSorting] = createSignal<SortingState>([])

    const initialState = mergeProps(props.initialState, {
        pagination: {
            pageSize: 10
        }
    })
    props.columns.forEach(c => {
       if (c.header === undefined) {
           c.header = (props) => <TableColumnHeader column={props.column} title={props.column.id}></TableColumnHeader>;
       }
    });

    const table = createSolidTable({
        get data() {
            return props.data
        },
        get columns() {
            return props.columns
        },
        state: {
            get sorting() {
                return sorting()
            },
            get columnVisibility() {
                return columnVisibility()
            },
            get rowSelection() {
                return rowSelection()
            },
            get columnFilters() {
                return columnFilters()
            },
        },
        initialState: initialState,
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        getFacetedMinMaxValues: getFacetedMinMaxValues(),
    })

    const filters: TableFacetedFilterProps<TData>[] = props.facetedFilters?.map((filter) => {
        const [local, others] = splitProps(filter as FilterSetupProps<TData>, ["column", "options"])
        let col = local.column ? table.getColumn(local.column) : undefined;
        let opts: NumberBasedOption | ValueBasedOption[];
        if (typeof local.options === 'function') {
            opts = local.options(col);
        } else {
            opts = local.options;
        }
        return {
            table: table,
            column: col,
            options: opts,
            ...others
        }
    }) || [];

    return (
        <div class="px-2">
            <TableToolbar table={table} filters={filters} searchColumn={props.searchColumn}/>
            <div class="rounded-md border mt-2">
                <Table>
                    <TableHeader>
                        <For each={table.getHeaderGroups()}>
                            {(headerGroup) => (
                                <TableRow>
                                    <For each={headerGroup.headers}>
                                        {(header) => (
                                            <TableHead colSpan={header.colSpan}>
                                                <Show when={!header.isPlaceholder}>
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                </Show>
                                            </TableHead>
                                        )}
                                    </For>
                                </TableRow>
                            )}
                        </For>
                    </TableHeader>
                    <TableBody>
                        <Show
                            when={table.getRowModel().rows?.length}
                            fallback={
                                <TableRow>
                                    <TableCell colSpan={props.columns.length} class="h-24 text-center">
                                        No results.
                                    </TableCell>
                                </TableRow>
                            }
                        >
                            <For each={table.getRowModel().rows}>
                                {(row) => (
                                    <TableRow data-state={row.getIsSelected() && "selected"}>
                                        <For each={row.getVisibleCells()}>
                                            {(cell) => (
                                                <TableCell>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            )}
                                        </For>
                                    </TableRow>
                                )}
                            </For>
                        </Show>
                    </TableBody>
                </Table>
            </div>
            <TablePagination table={table}/>
        </div>
    )
}