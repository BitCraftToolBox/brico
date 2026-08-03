import {msg} from "@lingui/core/macro";
import {For} from "solid-js";
import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {FoodDesc} from "~/bindings/src/food_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {sourceRow} from "~/lib/data-translation";
import {BuffLink} from "~/lib/game-links";
import {gameText} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    boolFilter,
    headerColumn,
    rangeFilter,
    rarityColumn,
    rarityFilter,
    rowActions,
    tierColumn,
    tierFilter,
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {consolidateStats, statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, fixFloat, readableSeconds} from "~/lib/utils";


// English buff descriptions: this backs a faceted filter, so the values end up in shared URLs.
// The cell renders BuffLink, which localizes for display. See table-utils/column-builders.tsx.
const foodToBuffNames = (food: FoodDesc, def: any) => {
    if (!food.buffs.length) return def;
    const buffIdx = BitCraftTables.BuffDesc.indexedBy("id");
    return food.buffs.map(b => {
        const buff = sourceRow(buffIdx().get(b.buffId));
        return buff?.description ?? `Buff #${b.buffId}`;
    });
}

export const FoodDefs: BitCraftToDataDef<FoodDesc> = {
    columns: [
        headerColumn<FoodDesc, any>({
            accessor: {accessorFn: food => BitCraftTables.ItemDesc.indexedBy("id")().get(food.itemId)?.name ?? `Item #${food.itemId}`},
            route: food => ["food", food.itemId],
            prefixElement: food => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")().get(food.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {id: "Satiation", meta: {label: gameText(msg`Satiation`)}, accessorKey: "hunger", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {
            id: "Buffs",
            meta: {label: msg`Buffs`},
            accessorFn: f => foodToBuffNames(f, undefined),
            getUniqueValues: f => foodToBuffNames(f, []),
            cell: p => {
                const food = p.row.original;
                if (!food.buffs?.length) return undefined;
                const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
                const buffs = food.buffs.map(b => [b, buffIdx.get(b.buffId)]).filter((b) => !!b[1]) as [BuffEffect, BuffDesc][];
                return (
                    <div class="flex flex-wrap gap-1">
                        <For each={buffs}>
                            {buff => <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">
                                <BuffLink buffId={buff[0].buffId} label={buff[1].description} class="font-medium" showIcon={false}/>
                                <span class="opacity-70">{readableSeconds(buff[0].duration ?? buff[1].duration)}</span>
                            </span>}
                        </For>
                    </div>
                );
            },
            sortingFn: (a, b) => {
                const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
                const getMax = (food: FoodDesc) => Math.max(...food.buffs?.map(be => be.duration ?? buffIdx.get(be.buffId)?.duration ?? 0));
                return getMax(a.original) - getMax(b.original);
            },
            sortUndefined: "last",
            filterFn: 'arrIncludesSome'
        },
        statsColumn("Buff Stats", {
            accessorFn: (food) => {
                const buffs = food.buffs;
                if (!buffs?.length) return undefined;
                const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
                return consolidateStats(buffs.flatMap(buffEffect => {
                    const buffDesc = buffIdx.get(buffEffect.buffId);
                    if (!buffDesc) return null;
                    return buffDesc.stats;
                }).filter((v): v is CsvStatEntry => v !== null));
            }
        }, gameText(msg`Food Buffs`)),
        {id: "TP Energy", meta: {label: gameText(msg`TP Energy`, "Teleportation Energy")}, accessorKey: "teleportationEnergy", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "HP", meta: {label: gameText(msg`HP`, "Health")}, accessorKey: "hp", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Up To HP", meta: {label: gameText(msg`Max Health`)}, accessorKey: "upToHp", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Stamina", meta: {label: gameText(msg`Stamina`)}, accessorKey: "stamina", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        {id: "Up To Stamina", meta: {label:gameText(msg`Max Stamina`)}, accessorKey: "upToStamina", cell: p => <span>{fixFloat(p.getValue() as number)}</span>, filterFn: "inNumberRange"},
        boolColumn<FoodDesc, boolean>("Consumable In Combat", {accessorKey: "consumableWhileInCombat"}, msg`Consumable In Combat`),
        tierColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: tool => BitCraftTables.ItemDesc.indexedBy("id")().get(tool.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        rangeFilter("Satiation", gameText(msg`Satiation`)),
        uniqueValuesFilter("Buffs", msg`Buffs`, compareOptions),
        statsFilter("Buff Stats", gameText(msg`Food Buffs`)),
        rangeFilter("TP Energy", gameText(msg`TP Energy`, "Teleportation Energy")),
        rangeFilter("HP", gameText(msg`HP`, "Health")),
        rangeFilter("Up To HP", gameText(msg`Max Health`)),
        rangeFilter("Stamina", gameText(msg`Stamina`)),
        rangeFilter("Up To Stamina", gameText(msg`Max Stamina`)),
        boolFilter("Consumable In Combat", msg`Consumable In Combat`),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"]
};
