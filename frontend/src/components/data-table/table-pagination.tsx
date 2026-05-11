import type {Table} from "@tanstack/solid-table"

import {
    TbOutlineCheck as IconCheck,
    TbOutlineChevronLeft as IconChevronLeft,
    TbOutlineChevronRight as IconChevronRight,
    TbOutlineChevronsLeft as IconChevronsLeft,
    TbOutlineChevronsRight as IconChevronsRight
} from "solid-icons/tb"
import {createSignal, Show} from "solid-js";
import {Button} from "~/components/ui/button"
import {NumberField, NumberFieldInput} from "~/components/ui/number-field";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "~/components/ui/select"

type TablePaginationProps<TData> = {
    table: Table<TData>
}

export function TablePagination<TData>(props: TablePaginationProps<TData>) {
    const [editing, setEditing] = createSignal(false);
    let setPageInput!: HTMLInputElement | null;

    function setPage(ev: any) {
        if (ev instanceof KeyboardEvent) {
            if (ev.key === "Escape") {
                setEditing(false);
                return;
            }
            if (ev.key !== "Enter")
                return;
        }
        const val = +setPageInput!.value.replace(/[^-.\d]/g, '');
        if (isNaN(val) || val <= 0 || val > props.table.getPageCount()) return;
        setEditing(false);
        props.table.setPageIndex(val - 1);
    }

    return (
        <div class="flex items-center justify-between py-2">
            <div class="flex-1 text-sm text-muted-foreground">
                {props.table.getFilteredRowModel().rows.length} of{" "}
                {props.table.getCoreRowModel().rows.length} row(s) shown.
            </div>
            <div class="flex items-center space-x-6 lg:space-x-8">
                <div class="flex items-center space-x-2">
                    <p class="text-sm font-medium">Rows per page</p>
                    <Select
                        value={props.table.getState().pagination.pageSize}
                        onChange={(value) => value && props.table.setPageSize(value)}
                        options={[8, 10, 20, 30, 40, 50]}
                        itemComponent={(props) => (
                            <SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
                        )}
                    >
                        <SelectTrigger class="h-8 w-[70px]">
                            <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent/>
                    </Select>
                </div>
                <div class="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        class="hidden size-8 p-0 lg:flex"
                        onClick={() => props.table.setPageIndex(0)}
                        disabled={!props.table.getCanPreviousPage()}
                    >
                        <span class="sr-only">Go to first page</span>
                        <IconChevronsLeft/>
                    </Button>
                    <Button
                        variant="outline"
                        class="size-8 p-0"
                        onClick={() => props.table.previousPage()}
                        disabled={!props.table.getCanPreviousPage()}
                    >
                        <span class="sr-only">Go to previous page</span>
                        <IconChevronLeft/>
                    </Button>
                    <div class="flex items-center justify-center text-sm font-medium">
                        <Show when={editing()} fallback={
                            <Button variant="ghost" class="w-fit px-2 sm underline decoration-dotted" onclick={() => {
                                setEditing(true);
                                setPageInput?.focus();
                                setPageInput?.select();
                            }}>
                                {props.table.getState().pagination.pageIndex + 1}
                            </Button>
                        }>
                            <NumberField class="w-12"
                                         defaultValue={props.table.getState().pagination.pageIndex + 1}
                                         minValue={1} maxValue={props.table.getPageCount()}
                            >
                                <NumberFieldInput ref={setPageInput} onKeyUp={setPage}/>
                            </NumberField>
                            <Button variant="ghost" onclick={setPage}><IconCheck/></Button>
                        </Show>
                        <span> of {props.table.getPageCount()}</span>
                    </div>
                    <Button
                        variant="outline"
                        class="size-8 p-0"
                        onClick={() => props.table.nextPage()}
                        disabled={!props.table.getCanNextPage()}
                    >
                        <span class="sr-only">Go to next page</span>
                        <IconChevronRight/>
                    </Button>
                    <Button
                        variant="outline"
                        class="hidden size-8 p-0 lg:flex"
                        onClick={() => props.table.setPageIndex(props.table.getPageCount() - 1)}
                        disabled={!props.table.getCanNextPage()}
                    >
                        <span class="sr-only">Go to last page</span>
                        <IconChevronsRight/>
                    </Button>
                </div>
            </div>
        </div>
    )
}