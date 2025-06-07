import {ColumnDef} from "@tanstack/solid-table";
import {FilterSetupProps} from "~/components/ui/data-table/data-table";
import {JSX} from "solid-js";
import {useDetailDialog} from "~/lib/contexts";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {Button} from "~/components/ui/button";


export type BitCraftToDataDef<T> = {
    columns: ColumnDef<T>[]
    facetedFilters?: FilterSetupProps<T>[]
    createDialog?: (data: T) => JSX.Element
}

export const rowActionRawOnly = {
    id: "actions",
    header: () => <></>,
    enableHiding: false,
    cell: (props: any) => {
        const dialog = useDetailDialog();
        return (
            <TableRowActions row={props.row}>
                <DropdownMenuItem>
                    <Button class="w-full" variant="ghost"
                            onclick={(ev: MouseEvent) => {
                                dialog.setContent(["raw", props.row.original])
                                dialog.setOpen(true);
                                ev.stopPropagation();
                            }}
                    >
                        Raw Details
                    </Button>
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <Button class="w-full" variant="ghost"
                            onclick={() => window.navigator.clipboard.writeText(String(props.row.original.id))}
                    >
                        Copy ID
                    </Button>
                </DropdownMenuItem>
            </TableRowActions>
        )
    }
}