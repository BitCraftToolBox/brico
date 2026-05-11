import {
    type Column,
    ColumnDef,
    ColumnFiltersState,
    createSolidTable,
    FilterFn,
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
import {createMemo, createSignal, For, mergeProps, Show, splitProps} from "solid-js"
import {Dynamic} from "solid-js/web";
import {TableColumnHeader} from "~/components/data-table/table-column-header";
import {NumberBasedOption, StatsBasedOption, TableFacetedFilterProps, ValueBasedOption} from "~/components/data-table/table-faceted-filter";

import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table"
import {useSettings} from "~/lib/settings";

import {TablePagination} from "./table-pagination"
import {TableToolbar} from "./table-toolbar"

type OptionsType<TData> = ValueBasedOption[] | NumberBasedOption | StatsBasedOption;
type OptionsFnOrValue<TData> = ((col: Column<TData> | undefined) => OptionsType<TData>) | OptionsType<TData>;

type DataTableProps<TData> = {
    name: string
    columns: ColumnDef<TData>[]
    data: TData[]
    facetedFilters?: FilterSetupProps<TData>[]
    searchColumns?: string[]
    initialState?: InitialTableState
}

export type FilterSetupProps<TData> = Omit<TableFacetedFilterProps<TData>, "table" | "column" | "options"> & {
    column?: string
    options: OptionsFnOrValue<TData>
}

export function DataTable<TData>(props: DataTableProps<TData>) {
    const {tablePageSize, tableHiddenColumns} = useSettings();

    // Restore persisted hidden columns for this table as the initial visibility state
    const persistedHidden: string[] = tableHiddenColumns()[props.name] ?? [];
    const initialColumnVisibility: VisibilityState = Object.fromEntries(
        persistedHidden.map((id) => [id, false])
    );

    const [rowSelection, setRowSelection] = createSignal({})
    const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>(initialColumnVisibility)
    const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>([])
    const [sorting, setSorting] = createSignal<SortingState>([])
    const [globalFilter, setGlobalFilter] = createSignal('')


    const initialState = mergeProps(props.initialState, {
        pagination: {
            pageSize: tablePageSize()
        }
    })
    props.columns.forEach(c => {
        if (c.header === undefined) {
            c.header = (props) => <TableColumnHeader column={props.column} title={props.column.id}></TableColumnHeader>;
        }
    });

    // Custom global filter function for multi-column search
    const globalFilterFn: FilterFn<TData> = (row, _columnId, value) => {
        if (!value || !props.searchColumns || props.searchColumns.length === 0) {
            return true;
        }

        const filterValue = String(value).toLowerCase();

        // Search across all specified search columns
        return props.searchColumns!.some(colId => {
            const colValue = row.getValue(colId);
            const valueStr = String(colValue || "").toLowerCase();
            return valueStr.includes(filterValue);
        });
    };

    const table = createSolidTable({
        meta: {
            name: props.name
        },
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
            get globalFilter() {
                return globalFilter()
            },
        },
        initialState: initialState,
        enableRowSelection: true,
        enableGlobalFilter: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        getFacetedMinMaxValues: getFacetedMinMaxValues(),
    })

    const filters = createMemo<TableFacetedFilterProps<TData>[]>(() => {
        return props.facetedFilters?.map((filter) => {
            const [local, others] = splitProps(filter as FilterSetupProps<TData>, ["column", "options"])
            const col = local.column ? table.getColumn(local.column) : undefined;

            // If options is a function, bind it to the resolved column and pass it through
            // so the filter component can evaluate it reactively (re-running when data changes)
            const options = typeof local.options === 'function'
                ? () => (local.options as (col: Column<TData> | undefined) => OptionsType<TData>)(col)
                : local.options;

            return {
                table: table,
                column: col,
                options,
                ...others
            }
        }) || [];
    });

    return (
        <div class="px-2">
            <TableToolbar table={table} filters={filters()} searchColumns={props.searchColumns}/>
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
                                                    <Dynamic component={header.column.columnDef.header}
                                                             {...header.getContext()}
                                                    />
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
                                            {(cell: any) => (
                                                <TableCell>
                                                    <Dynamic component={cell.column.columnDef.cell}
                                                             {...cell.getContext()}
                                                    />
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
    );
}