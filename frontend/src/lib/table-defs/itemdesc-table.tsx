import {CsvStatEntry, ItemDesc} from "~/bindings/ts";
import {useDetailDialog} from "~/lib/contexts";
import {Button} from "~/components/ui/button";
import {cn, compareBasic, fixFloat, includedIn, splitCamelCase} from "~/lib/utils";
import {Rarities, Tiers} from "~/lib/bitcraft-utils";
import {BitCraftToDataDef} from "~/lib/table-defs/base";
import {BitCraftTables} from "~/lib/spacetime";
import {Column} from "@tanstack/solid-table";
import {For} from "solid-js";
import {DropdownMenuItem} from "~/components/ui/dropdown-menu";
import {TableRowActions} from "~/components/ui/data-table/table-row-actions";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {ItemIcon} from "~/components/bitcraft/items";
import {TierIcon} from "~/components/bitcraft/misc";


type ItemStats = {
    readonly name: string
    readonly value: number
    readonly isPct: boolean
}[]

const statCache = new Map<number, ItemStats>();

function computeStatsForItem(item: ItemDesc): ItemStats | undefined {
    const toolIndex = BitCraftTables.ToolDesc.indexedBy("itemId");
    const equipIndex = BitCraftTables.EquipmentDesc.indexedBy("itemId");
    const foodIndex = BitCraftTables.FoodDesc.indexedBy("itemId");
    const weaponIndex = BitCraftTables.WeaponDesc.indexedBy("itemId");

    if (!toolIndex || !equipIndex || !foodIndex || !weaponIndex) {
        return undefined;
    }

    let id = item.id;
    let stats = [];

    function addStat(statEntry: CsvStatEntry) {
        stats.push({
            name: splitCamelCase(statEntry.id as unknown as string),
            value: statEntry.value,
            isPct: statEntry.isPct
        })
    }

    let tool = toolIndex()!.get(id);
    if (tool) {
        stats.push({
            name: 'Tool Power',
            value: tool.power,
            isPct: false
        })
    }

    let equip = equipIndex()!.get(id);
    if (equip) {
        equip.stats.forEach(addStat)
    }

    let weapon = weaponIndex()!.get(id);
    if (weapon) {
        stats.push({name: 'Min Damage', value: weapon.minDamage, isPct: false})
        stats.push({name: 'Min Damage', value: weapon.maxDamage, isPct: false})
        stats.push({name: 'Stamina Multiplier', value: weapon.staminaUseMultiplier, isPct: false})
        stats.push({name: 'Cooldown', value: weapon.cooldown, isPct: false})
    }

    let food = foodIndex()!.get(id);
    if (food) {
        const buffs = BitCraftTables.BuffDesc.indexedBy('id');
        if (!buffs) return undefined;
        if (food.hunger) stats.push({name: 'Satiation', value: food.hunger, isPct: false})
        if (food.stamina) stats.push({name: 'Stamina', value: food.stamina, isPct: false})
        if (food.hp) stats.push({name: 'HP', value: food.hp, isPct: false})
        if (food.upToStamina) stats.push({name: 'Up to Stamina', value: food.upToStamina, isPct: false})
        if (food.upToHp) stats.push({name: 'Up to Hp', value: food.upToHp, isPct: false})
        if (food.teleportationEnergy) stats.push({
            name: 'Teleportation Energy',
            value: food.teleportationEnergy,
            isPct: false
        })
        food.buffs.forEach(buff => {
            let buffInfo = buffs()!.get(buff.buffId);
            buffInfo?.stats.forEach(addStat);
        })
    }

    return stats;
}

function getItemStats(item: ItemDesc): ItemStats | undefined {
    let stats = statCache.get(item.id);
    if (stats) return stats;
    stats = computeStatsForItem(item);
    // if we haven't loaded up yet, don't cache it so the next call can re-try.
    // though, I don't know if table data will ever get reloaded
    if (!stats) return undefined;
    statCache.set(item.id, stats);
    return stats;
}

function getItemStatNames(item: ItemDesc) {
    const stats = getItemStats(item);
    if (!stats) return undefined;
    return stats.map(stat => splitCamelCase(stat.name) + (stat.isPct ? ' %' : ''));
}

function getItemStatValues(item: ItemDesc) {
    const stats = getItemStats(item);
    if (!stats) return undefined;
    return stats.map(stat => stat.value * (stat.isPct ? 100 : 1));
}

function getItemStatNamesForFilters(item: ItemDesc) {
    return getItemStatNames(item) || [];
}

function getItemStatValuesForFilters(item: ItemDesc) {
    const stats = getItemStats(item);
    if (!stats) return [];
    return stats.map(stat => {
        // some dev items have inflated stats. don't make range filters unusable because of them
        if (stat.value > 9000) {
            return null;
        }
        return stat.value;
    });
}

export const ItemDescDefs: BitCraftToDataDef<ItemDesc> = {
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
                            dialog.setContent(["ItemDesc", props.row.original]);
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
            filterFn: includedIn<ItemDesc>()
        },
        {
            id: "Stats",
            accessorFn: getItemStatNames,
            filterFn: 'arrIncludesSome',
            getUniqueValues: getItemStatNamesForFilters,
            cell: (props) => (
                <div class="flex flex-col text-end">
                    <For each={props.row.getValue(props.column.id)}>
                        {stat => (<div class="text-nowrap">{stat}</div>)}
                    </For>
                </div>
            ),
            sortUndefined: 'last' // TODO figure out later why this doesn't work
        },
        {
            id: "Stat Values",
            accessorFn: getItemStatValues,
            filterFn: 'inNumberRange',
            getUniqueValues: getItemStatValuesForFilters,
            cell: (props) => (
                <div class="flex flex-col text-start">
                    <For each={props.row.getValue(props.column.id) as (number | null)[]}>
                        {stat => (<div>{Number.isNaN(stat) || stat === null ? stat : fixFloat(stat)}</div>)}
                    </For>
                </div>
            ),
            sortingFn: (rowA, rowB) => {
                const valsA = rowA.getValue('Stat Values') as (number | null)[];
                const valsB = rowB.getValue('Stat Values') as (number | null)[];
                if (!valsA.length && valsB.length) return -1;
                if (valsA.length && !valsB.length) return 1;
                if (!valsA.length && !valsB.length) return 0;
                return compareBasic(
                    valsA.filter(n => n !== null).reduce((p, n) => p > n ? p : n),
                    valsB.filter(n => n !== null).reduce((p, n) => p > n ? p : n),
                );
            },
            sortUndefined: 'last' // TODO as stat names
        },
        {
            id: "Volume",
            accessorKey: "volume",
            filterFn: 'inNumberRange',
            cell: (props) => (
                <Tooltip>
                    <TooltipTrigger>{props.row.original.volume}</TooltipTrigger>
                    <TooltipContent>
                        Inventory stack: {6000 / props.row.original.volume}, container
                        stack: {60000 / props.row.original.volume}
                    </TooltipContent>
                </Tooltip>
            )
        },
        {
            id: "Rarity",
            accessorKey: "rarity.tag",
            filterFn: includedIn<ItemDesc>(),
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
            filterFn: includedIn<ItemDesc>(),
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
                                    dialog.setContent(["ItemDesc", props.row.original])
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
            options: (col: Column<ItemDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray()
            }
        },
        {
            column: "Stats",
            title: "Stats",
            options: (col: Column<ItemDesc> | undefined) => {
                if (!col) return [];
                return col.getFacetedUniqueValues().keys().map(v => {
                    return {
                        label: v, value: v
                    }
                }).toArray()
            }
        },
        {
            column: "Stat Values",
            title: "Stat Values",
            options: (col: Column<ItemDesc> | undefined) => {
                let fullRange = col ? col.getFacetedUniqueValues() : null;
                let minMax: [number, number];
                if (!fullRange) {
                    minMax = [0, 0];
                } else {
                    let min = 10000, max = -10000;
                    for (let elem of fullRange) {
                        if (elem === null) continue;
                        if (elem[0] < min) min = elem[0];
                        // disregard dev items
                        if (elem[0] > max && elem[0] < 10000) max = elem[0];
                    }
                    minMax = [min, max];
                }
                return {
                    label: "Range",
                    minMax: minMax,
                }
            }
        },
        {
            column: "Volume",
            title: "Volume",
            options: (col: Column<ItemDesc> | undefined) => {
                let minMax = col ? col.getFacetedMinMaxValues() : null;
                return {
                    label: "Volume",
                    minMax: minMax || [0, 0]
                }
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