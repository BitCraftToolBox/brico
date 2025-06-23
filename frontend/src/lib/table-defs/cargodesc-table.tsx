import {CargoDesc} from "~/bindings/ts";
import {useDetailDialog} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {cn, compareBasic, includedIn} from "~/lib/utils";
import {Rarities, Tiers} from "~/lib/bitcraft-utils";
import {BitCraftToDataDef} from "~/lib/table-defs/base";
import {Column} from "@tanstack/solid-table";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {ItemIcon} from "~/components/bitcraft/items";
import {TierIcon} from "~/components/bitcraft/misc";
import {BitCraftTables} from "~/lib/spacetime";


export const CargoDescDefs: BitCraftToDataDef<CargoDesc> = {
    columns: [
        {
            id: "Name",
            accessorKey: "name",
            cell: (props) => {
                const dialog = useDetailDialog();
                return (
                    <Button
                        variant="ghost" class="w-full justify-start"
                        onclick={(ev: MouseEvent) => {
                            dialog.setContent(["CargoDesc", props.row.original]);
                            dialog.setOpen(true);
                            ev.stopPropagation();
                        }}
                    >
                        <ItemIcon item={props.row.original} noInteract={true}/>{props.row.original.name}
                    </Button>
                )
            },
            enableHiding: false
        },
        {
            id: "Tag",
            accessorKey: "tag",
            filterFn: includedIn<CargoDesc>()
        },
        {
            id: "Supply",
            accessorFn: (cargo: CargoDesc) => BitCraftTables.BuildingRepairsDesc.indexedBy("cargoId")?.()?.get(cargo.id)?.repairValue,
            filterFn: 'inNumberRange',
            sortUndefined: 'last'
        },
        {
            id: "Rarity",
            accessorKey: "rarity", // TODO .tag
            filterFn: includedIn<CargoDesc>(),
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
            filterFn: includedIn<CargoDesc>(),
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
                                    dialog.setContent(["CargoDesc", props.row.original])
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
            options: (col: Column<CargoDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray()
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
        {
            column: "Supply",
            title: "Supply",
            options: (col: Column<CargoDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Supply",
                    minMax: minMax || [0, 0]
                }
            }
        },
    ]
}