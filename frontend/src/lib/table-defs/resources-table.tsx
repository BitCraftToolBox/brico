import {ResourceDesc} from "~/bindings/src";
import {BitCraftToDataDef} from "~/lib/table-defs/base";
import {useDetailDialog} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {ResourceIcon} from "~/components/bitcraft/resources";
import {cn, compareBasic, includedIn} from "~/lib/utils";
import {Rarities, Tiers} from "~/lib/bitcraft-utils";
import {TierIcon} from "~/components/bitcraft/misc";
import {Column} from "@tanstack/solid-table";


export const ResourceDescDefs: BitCraftToDataDef<ResourceDesc> = {
    columns: [
        {
            id: "Name",
            accessorKey: "name",
            cell: (props) => {
                const dialog = useDetailDialog();
                return (
                    <Button
                        variant="ghost" class="w-full justify-start h-[65px]"
                        onclick={(ev: MouseEvent) => {
                            dialog.setContent(["ResourceDesc", props.row.original]);
                            dialog.setOpen(true);
                            ev.stopPropagation();
                        }}
                    >
                        <ResourceIcon res={props.row.original}/> {props.row.original.name}
                    </Button>
                )
            },
            enableHiding: false
        },
        {
            id: "Tag",
            accessorKey: "tag",
            filterFn: includedIn<ResourceDesc>()
        },
        {
            id: "Rarity",
            accessorKey: "rarity.tag",
            filterFn: includedIn<ResourceDesc>(),
            sortingFn: (rowA, rowB) => {
                if (rowA.original.rarity === rowB.original.rarity) return 0;
                const a = Rarities.toValue(rowA.original.rarity);
                const b = Rarities.toValue(rowB.original.rarity);
                return compareBasic(a, b);
            }
        },
        {
            id: "Tier",
            accessorKey: "tier",
            filterFn: includedIn<ResourceDesc>(),
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
                                    dialog.setContent(["ResourceDesc", props.row.original])
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
        {
            column: "Tag",
            title: "Tag",
            options: (col: Column<ResourceDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray().sort((a, b) => a.label.localeCompare(b.label))
            }
        },
        {
            column: "Rarity",
            title: "Rarity",
            options: Rarities.rarities.map(r => {
                return {
                    label: r,
                    value: r,
                }
            })
        },
        {
            column: "Tier",
            title: "Tier",
            options: Tiers.tiers.map(t => {
                return {
                    label: String(t.value),
                    value: t.value,
                    icon: (props) => t.value > 0 && t.value <= 10 ? <TierIcon tier={t.value} class={cn("mr-1", props.class)}/> : ""
                }
            })
        },
    ]
}