import {Column, Table} from "@tanstack/solid-table"

import {TbOutlineSettings as IconSettings} from "solid-icons/tb"
import {For} from "solid-js"
import {Button} from "~/components/ui/button"
import {DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger} from "~/components/ui/dropdown-menu"
import {useSettings} from "~/lib/settings";

type TableViewOptionsProps<TData> = {
    table: Table<TData>
}

export function TableViewOptions<TData>(props: TableViewOptionsProps<TData>) {
    // @ts-ignore this should be added via module augmentation but that breaks things somehow
    const name: string | undefined = props.table.options.meta?.["name"];

    const {tableHiddenColumns, setTableHiddenColumns} = useSettings();

    /** Persist a single column visibility change. */
    const persistToggle = (colId: string, visible: boolean) => {
        if (!name) return;
        const current = tableHiddenColumns()[name] ?? [];
        setTableHiddenColumns({
            ...tableHiddenColumns(),
            [name]: visible
                ? current.filter(id => id !== colId)
                : current.includes(colId) ? current : [...current, colId],
        });
    };

    /** Persist a "show all / hide all" change. */
    const persistAll = (visible: boolean) => {
        if (!name) return;
        if (visible) {
            const next = {...tableHiddenColumns()};
            delete next[name];
            setTableHiddenColumns(next);
        } else {
            const allIds = props.table
                .getAllColumns()
                .filter(c => typeof c.accessorFn !== "undefined" && c.getCanHide())
                .map(c => c.id);
            setTableHiddenColumns({...tableHiddenColumns(), [name]: allIds});
        }
    };

    const toggleAllVisible = (visible: boolean) => {
        props.table.getAllColumns().forEach(c => c.toggleVisibility(visible));
        persistAll(visible);
    };

    const toggleVisibility = (column: Column<TData>, visible: boolean) => {
        column.toggleVisibility(visible);
        persistToggle(column.id, visible);
    };

    return (
        <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
                as={Button<"button">}
                variant="outline"
                size="sm"
                class="h-8 w-auto px-2 sm:px-3"
            >
                <IconSettings/>
                View
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel class={"text-center"}>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator/>
                <div class={"flex gap-1"}>
                    <Button variant="ghost" class={"text-xs"} onclick={() => toggleAllVisible(true)}>
                        Show All
                    </Button>
                    <Button variant="ghost" class={"text-xs"} onclick={() => toggleAllVisible(false)}>
                        Hide All
                    </Button>
                </div>
                <DropdownMenuSeparator/>
                <For
                    each={props.table
                        .getAllColumns()
                        .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())}
                >
                    {(column) => (
                        <DropdownMenuCheckboxItem
                            checked={column.getIsVisible()}
                            onChange={(value) => toggleVisibility(column, value)}
                        >
                            {column.id}
                        </DropdownMenuCheckboxItem>
                    )}
                </For>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}