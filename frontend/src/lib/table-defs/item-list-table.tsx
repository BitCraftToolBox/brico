import {ItemListDesc} from "~/bindings/src";
import {useDetailDialog, UseFullNodeOutputContext} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {BitCraftToDataDef} from "~/lib/table-defs/base";
import {createMemo, createSignal} from "solid-js";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {ItemIcon, ItemListComponent} from "~/components/bitcraft/items";
import {BitCraftTables} from "~/lib/spacetime";

export const ItemListDescDefs: BitCraftToDataDef<ItemListDesc> = {
    columns: [
        {
            id: "Name",
            accessorKey: "name",
            cell: (props) => {
                const dialog = useDetailDialog();
                const itemsByListId = createMemo(() => BitCraftTables.ItemDesc.indexedBy("itemListId"));
                const correspondingItem = createMemo(() => {
                    const index = itemsByListId();
                    if (!index) return null;

                    // Get all items that have itemListId equal to this row's id
                    // Return the first item if any exist
                    return index()?.get(props.row.original.id);
                });

                return (
                    <Button
                        variant="ghost" class="w-full justify-start"
                        onclick={(ev: MouseEvent) => {
                            dialog.setContent(["ItemListDesc", props.row.original]);
                            dialog.setOpen(true);
                            ev.stopPropagation();
                        }}
                    >
                        {correspondingItem() && <ItemIcon item={correspondingItem()!} />}
                        {props.row.original.name}
                    </Button>
                )
            },
            enableHiding: false
        },
        {
            id: "Possible Items",
            accessorFn: (row) => row,
            cell: (props) => {
                const [useFullNode, setUseFullNode] = createSignal(false);
                const fullNodeContext = {
                    useFullNode: useFullNode, 
                    setUseFullNode: setUseFullNode, 
                    toggle: () => setUseFullNode(!useFullNode())
                };

                return (
                    <UseFullNodeOutputContext.Provider value={fullNodeContext}>
                        <ItemListComponent itemList={props.row.original} showTip={true} />
                    </UseFullNodeOutputContext.Provider>
                );
            }
        },
        {
            id: "actions",
            header: () => <></>,
            enableHiding: false,
            cell: (props) => {
                const dialog = useDetailDialog();
                return (
                    <TableRowActions row={props.row}>
                        <DropdownMenuItem>
                            <Button
                                class="w-full" variant="ghost"
                                onclick={(ev: MouseEvent) => {
                                    dialog.setContent(["ItemListDesc", props.row.original])
                                    dialog.setOpen(true);
                                    ev.stopPropagation();
                                }}
                            >
                                View Details
                            </Button>
                        </DropdownMenuItem>
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
    ],
    facetedFilters: [
    ]
}
