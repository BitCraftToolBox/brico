/**
 * live-table.tsx — the shared table chrome, for tables whose rows are a live feed.
 *
 * `DataTable` is built around the static database tables: it owns search, faceted filters, URL
 * round-tripping and per-table session state, and it installs the three faceted row models on
 * every table whether or not anything uses them. A feed like the craft browser wants none of that
 * — filtering there belongs to `FilterBuilder`, there is no page to navigate back to, and
 * re-deriving per-column facets over a few thousand rows twice a second is pure cost.
 *
 * What it does want is the parts that make a table on this site *look and behave like the others*:
 * sortable column headers with the same dropdown, the same pagination bar, the same "View" column
 * toggle, and the same persisted hidden-column set. Those are already three separate components,
 * so this is a thin frame around them and a `createSolidTable` configured with the two row models
 * that are actually needed.
 */
import {Trans} from "@lingui/solid/macro";
import {
    type ColumnDef,
    createSolidTable,
    type ExpandedState,
    getCoreRowModel,
    getExpandedRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type HeaderContext,
    type InitialTableState,
    type VisibilityState,
} from "@tanstack/solid-table";
import {createEffect, createMemo, createSignal, For, type JSX, Show} from "solid-js";
import {Dynamic} from "solid-js/web";
import {TableColumnHeader} from "~/components/data-table/table-column-header";
import {TablePagination} from "~/components/data-table/table-pagination";
import {TableViewOptions} from "~/components/data-table/table-view-options";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {useLabel} from "~/lib/labels";
import {type TableSessionState, useSettings} from "~/lib/settings";

type LiveTableProps<TData> = {
    /**
     * Identifies the table to the settings store, which is where the hidden-column set is kept.
     * Shares the namespace with `DataTable`'s tables, so it has to be unique across both.
     */
    name: string;
    columns: ColumnDef<TData, any>[];
    data: TData[];
    /** Stable row identity. Worth supplying for a feed, whose row objects are rebuilt each tick. */
    getRowId?: (row: TData, index: number) => string;
    /** Enables hierarchical rows (group parent + expandable subrows) when supplied — wires
     * `getExpandedRowModel`/`getSubRows`. Inert when omitted: no row ever has subrows, so the
     * table's other consumers are unaffected. */
    getSubRows?: (row: TData) => TData[] | undefined;
    initialState?: InitialTableState;
    /** Controls placed in the toolbar row, to the left of the "View" button. */
    toolbar?: JSX.Element;
    /** Shown in place of the rows when there are none. */
    empty?: JSX.Element;
    /** Replaces the pagination bar's default "{filtered} of {core} row(s) shown" text. */
    paginationLabel?: JSX.Element;
    /**
     * Sort/pagination state supplied by the caller — e.g. from a persisted setting — in place of
     * this table's own ephemeral `TableSessionState`. Every other `LiveTable` should keep omitting
     * this: their sort/page reset on reload on purpose, same as any other per-table session state.
     */
    session?: Pick<TableSessionState, "sorting" | "setSorting" | "pagination" | "setPagination">;
};

export function LiveTable<TData>(props: LiveTableProps<TData>) {
    const {tableHiddenColumns, getTableSession} = useSettings();
    const label = useLabel();

    // Same storage as `DataTable`'s, so a column hidden here stays hidden across reloads and the
    // "View" dropdown behaves identically. Read once: `TableViewOptions` writes both this table's
    // state and the persisted copy, and re-reading would fight it.
    const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>(
        Object.fromEntries((tableHiddenColumns()[props.name] ?? []).map(id => [id, false])),
    );

    // live tables don't use the global or column filters, but we use existing session
    // mechanisms to persist sorting and pagination across page transitions — unless the caller
    // hands in its own (persisted) session, e.g. the craft browser's.
    const session = props.session ?? getTableSession(props.name);
    const [sorting, setSorting] = [session.sorting, session.setSorting];
    const [pagination, setPagination] = [session.pagination, session.setPagination];

    // Expansion doesn't need to survive a reload the way sorting/pagination do, so it's a plain
    // local signal rather than another `getTableSession` slot.
    const [expanded, setExpanded] = createSignal<ExpandedState>({});

    if (!sorting().length && props.initialState?.sorting?.length) {
        setSorting(props.initialState.sorting);
    }

    // `DataTable` fills in missing headers by assigning to the caller's column defs during render.
    // Copying instead keeps a caller's module-level column array from being mutated under it.
    const columns = createMemo<ColumnDef<TData, any>[]>(() => props.columns.map(column => column.header !== undefined ? column : {
        ...column,
        // Spreading a `ColumnDef` union widens it past the accessor-vs-display discrimination, so
        // the narrowing has to be re-asserted; only `header` is being added.
        header: (ctx: HeaderContext<TData, unknown>) => (
            <TableColumnHeader column={ctx.column} table={table} title={label(column.meta?.label ?? ctx.column.id)}/>
        ),
    } as ColumnDef<TData, any>));

    const table = createSolidTable<TData>({
        meta: {name: props.name},
        get data() {
            return props.data;
        },
        get columns() {
            return columns();
        },
        state: {
            get sorting() {
                return sorting();
            },
            get columnVisibility() {
                return columnVisibility();
            },
            get pagination() {
                return pagination();
            },
            get expanded() {
                return expanded();
            },
        },
        initialState: props.initialState,
        getRowId: props.getRowId,
        getSubRows: props.getSubRows,
        enableRowSelection: false,
        enableMultiSort: true,
        // A live feed replaces `data` several times a second, and the default would read every one
        // of those as "new data, go back to page 1" — the reader could never leave the first page.
        autoResetPageIndex: false,
        // Same reasoning, one feature over: the default would collapse every expanded group on the
        // next tick.
        autoResetExpanded: false,
        // A group's subrows always render on the group's own page, never split off onto the next
        // page by the page-size cutoff.
        paginateExpandedRows: false,
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        onExpandedChange: setExpanded,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    // With the automatic reset off, a filter that narrows the feed can leave the reader stranded
    // past the last page, so clamp explicitly instead.
    createEffect(() => {
        const pageCount = table.getPageCount();
        if (pageCount > 0 && pagination().pageIndex >= pageCount) table.setPageIndex(pageCount - 1);
    });

    return (
        <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">{props.toolbar}</div>
                <TableViewOptions table={table}/>
            </div>
            <div class="rounded-md border">
                <Table>
                    <TableHeader>
                        <For each={table.getHeaderGroups()}>
                            {headerGroup => (
                                <TableRow>
                                    <For each={headerGroup.headers}>
                                        {header => (
                                            <TableHead colSpan={header.colSpan}>
                                                <Show when={!header.isPlaceholder}>
                                                    <Dynamic component={header.column.columnDef.header} {...header.getContext()}/>
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
                            when={table.getRowModel().rows.length}
                            fallback={
                                <TableRow>
                                    <TableCell colSpan={table.getVisibleLeafColumns().length} class="h-24 text-center text-muted-foreground">
                                        {props.empty ?? <Trans>No results.</Trans>}
                                    </TableCell>
                                </TableRow>
                            }
                        >
                            {/* `For`, keyed on the row's stable id (from `getRowId`) rather than the
                                row object a feed rebuilds every tick. Keying on the object made
                                every `<TableRow>` a brand-new DOM node each snapshot, which reset
                                hover/CSS state (and would reset any per-row interactive state) even
                                when nothing displayed had changed. Looking the row back up by id
                                inside a memo keeps the `<TableRow>` element itself stable; cells
                                are still rebuilt on every tick, which is fine — no cell here holds
                                interactive state, and the column defs read `row.original`
                                non-reactively on purpose (see the comment above `COLUMNS`), relying
                                on that rebuild to pick up fresh values. `Index` is not an
                                alternative for the cells, since a cell receives its context as a
                                one-time spread and would never see the new row. */}
                            <For each={table.getRowModel().rows.map(row => row.id)}>
                                {rowId => {
                                    const row = createMemo(() => table.getRowModel().rows.find(r => r.id === rowId));
                                    return (
                                        <Show when={row()}>
                                            {currentRow => (
                                                <TableRow>
                                                    <For each={currentRow().getVisibleCells()}>
                                                        {cell => (
                                                            <TableCell>
                                                                <Dynamic component={cell.column.columnDef.cell} {...cell.getContext()}/>
                                                            </TableCell>
                                                        )}
                                                    </For>
                                                </TableRow>
                                            )}
                                        </Show>
                                    );
                                }}
                            </For>
                        </Show>
                    </TableBody>
                </Table>
            </div>
            <TablePagination table={table} label={props.paginationLabel}/>
        </div>
    );
}
