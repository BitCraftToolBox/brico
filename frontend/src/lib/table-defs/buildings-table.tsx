import {BuildingDesc} from "~/bindings/src";
import {BitCraftToDataDef} from "~/lib/table-defs/base";
import {Column} from "@tanstack/solid-table";
import {useDetailDialog} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {BuildingIcon} from "~/components/bitcraft/buildings";
import {BitCraftTables} from "~/lib/spacetime";
import {cn, includedIn} from "~/lib/utils";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {getBuildingTier, Tiers} from "~/lib/bitcraft-utils";
import {TierIcon} from "~/components/bitcraft/misc";


class FuncTypes {
    static STORAGE = [3, 1721785854];
    static STOCKPILE = [4, 1721785854];
    static TRADE = [30];
    static PASSIVE_CRAFTING = [12, 14, 15, 21, 24, 34];
    static CRAFTING = [13, 16, 17, 20, 22, 23, 25, 33, 40, 44, 48, 635094930, 1559722792, 2012420824];
    static HOUSING = [787619404];
}

export const BuildingDescDefs: BitCraftToDataDef<BuildingDesc> = {
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
                            dialog.setContent(["BuildingDesc", props.row.original]);
                            dialog.setOpen(true);
                            ev.stopPropagation();
                        }}
                    >
                        <BuildingIcon building={props.row.original}/> {props.row.original.name}
                    </Button>
                )
            },
            enableHiding: false
        },
        {
            id: "Type",
            accessorFn: (bldg: BuildingDesc) => {
                const bldgTypes = BitCraftTables.BuildingTypeDesc.indexedBy("id");
                return bldg.functions.map(func => bldgTypes!()!.get(func.functionType)?.name || "Unknown");
            },
            getUniqueValues: (bldg: BuildingDesc) => {
                const bldgTypes = BitCraftTables.BuildingTypeDesc.indexedBy("id");
                return bldg.functions.map(func => bldgTypes!()!.get(func.functionType)?.name || "Unknown");
            },
            filterFn: 'arrIncludesSome'
        },
        {
            id: "Tier",
            accessorFn: getBuildingTier,
            filterFn: includedIn<BuildingDesc>(),
        },
        {
            id: "Item Slots",
            accessorFn: (bldg: BuildingDesc) => bldg.functions
                .filter(func => FuncTypes.STORAGE.includes(func.functionType))
                .map(func => func.storageSlots)
                .find(Boolean),
            filterFn: 'inNumberRange',
            sortUndefined: 'last'
        },
        {
            id: "Item Stack Size",
            accessorFn: (bldg: BuildingDesc) => bldg.functions
                .filter(func => FuncTypes.STORAGE.includes(func.functionType))
                .map(func => func.itemSlotSize / 6000)
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
        },
        {
            id: "Cargo Slots",
            accessorFn: (bldg: BuildingDesc) => bldg.functions
                .filter(func => FuncTypes.STOCKPILE.includes(func.functionType))
                .map(func => func.cargoSlots)
                .find(Boolean),
            filterFn: 'inNumberRange',
            sortUndefined: 'last'
        },
        {
            id: "Cargo Stack Size",
            accessorFn: (bldg: BuildingDesc) => bldg.functions
                .filter(func => FuncTypes.STOCKPILE.includes(func.functionType))
                .map(func => func.cargoSlotSize / 6000)
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
        },
        {
            id: "Trade Slots",
            accessorFn: (dep: BuildingDesc) => dep.functions
                .filter(func => FuncTypes.TRADE.includes(func.functionType))
                .map(func => func.tradeOrders)
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
        },
        {
            id: "Crafting Slots",
            accessorFn: (dep: BuildingDesc) => dep.functions
                .map(func =>
                    FuncTypes.CRAFTING.includes(func.functionType) ? func.craftingSlots
                        : FuncTypes.PASSIVE_CRAFTING.includes(func.functionType) ? func.refiningSlots
                            : null
                )
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
        },
        {
            id: "Housing Slots",
            accessorFn: (dep: BuildingDesc) => dep.functions
                .map(func =>
                    FuncTypes.HOUSING.includes(func.functionType) ? func.housingSlots : null
                )
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
        },
        {
            id: "Housing Income",
            accessorFn: (dep: BuildingDesc) => dep.functions
                .map(func =>
                    FuncTypes.HOUSING.includes(func.functionType) ? func.housingIncome : null
                )
                .find(Boolean),
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: 'last'
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
                                    dialog.setContent(["BuildingDesc", props.row.original])
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
            column: "Type",
            title: "Type",
            options: (col: Column<BuildingDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return { label: v, value: v }
                }).toArray()
            }
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
            column: "Item Slots",
            title: "Item Slots",
            options: (col: Column<BuildingDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Item Slots",
                    minMax: minMax || [0, 0]
                }
            }
        },
        {
            column: "Item Stack Size",
            title: "Item Stack Size",
            options: (col: Column<BuildingDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    if (!v) return null;
                    return {
                        label: v, value: v
                    }
                }).toArray().filter(v => !!v);
            }
        },
        {
            column: "Cargo Slots",
            title: "Cargo Slots",
            options: (col: Column<BuildingDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Cargo Slots",
                    minMax: minMax || [0, 0]
                }
            }
        },
        {
            column: "Cargo Stack Size",
            title: "Cargo Stack Size",
            options: (col: Column<BuildingDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    if (!v) return null;
                    return {
                        label: v, value: v
                    }
                }).toArray().filter(v => !!v);
            }
        },
        {
            column: "Trade Slots",
            title: "Trade Slots",
            options: (col: Column<BuildingDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    if (!v) return null;
                    return {
                        label: v, value: v
                    }
                }).toArray().filter(v => !!v);
            }
        },
        {
            column: "Crafting Slots",
            title: "Crafting Slots",
            options: (col: Column<BuildingDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    if (!v) return null;
                    return {
                        label: v, value: v
                    }
                }).toArray().filter(v => !!v).sort((a, b) => a.value > b.value ? 1 : b.value > a.value ? -1 : 0);
            }
        },
    ]
}