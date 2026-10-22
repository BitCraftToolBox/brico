import {AbilityCustomDesc, ItemType} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {Show} from "solid-js";
import {GameIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {sourceRow} from "~/lib/data-translation";
import {BuffLinkById, ItemStackLink, LinkedList, PlaceableLinkById, SkillLinkById} from "~/lib/game-links";
import {gameText} from "~/lib/labels";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    boolFilter,
    buffsColumn,
    buffStatsColumn,
    descriptionColumn,
    headerColumn,
    rangeFilter,
    rowActions,
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, readableSeconds} from "~/lib/utils";

/** The skill an ability's profession hit trains, or undefined when it performs none. */
function professionHitSkillId(a: AbilityCustomDesc): number | undefined {
    return a.performProfessionHit && a.professionHitSkillId > 0 ? a.professionHitSkillId : undefined;
}

/** English item/cargo name — backs search, so it must not follow the data locale. */
function stackName(stack: { itemId: number, itemType: ItemType }): string {
    return stack.itemType.tag === ItemType.Cargo.tag
        ? sourceRow(BitCraftTables.CargoDesc.indexedBy("id")().get(stack.itemId))?.name ?? `Cargo #${stack.itemId}`
        : sourceRow(BitCraftTables.ItemDesc.indexedBy("id")().get(stack.itemId))?.name ?? `Item #${stack.itemId}`;
}

/** English buff descriptions (backs search/filter), so they must not follow the data locale. */
function buffNames(a: AbilityCustomDesc): string[] | undefined {
    return a.requiredBuffIds?.map(id => sourceRow(BitCraftTables.BuffDesc.indexedBy("id")().get(id))?.description ?? `Buff #${id}`);
}

function placeableNames(a: AbilityCustomDesc): string[] | undefined {
    return a.spawnedPlaceables?.map(sp => sourceRow(BitCraftTables.PlaceableDesc.indexedBy("id")().get(sp.placeableId))?.name ?? `Placeable #${sp.placeableId}`);
}

/** Output stacks that resolve to an actual item (the stack is optional on the wire). */
function outputStacks(a: AbilityCustomDesc) {
    return (a.outputItemStacks ?? []).flatMap(o => o.itemStack ? [o.itemStack] : []);
}

/**
 * Deliberately narrow: `castTime`, `range`, `radius`, `damage`, `threatValue`, `globalCooldown` and
 * `linkedAbilityBuffDescId` are 0 for every row, `friendly` is always true, `buffToggle` always
 * false, and `animation` is `"None"`/`""` — none of them tell the reader anything. The Raw Data tab
 * on the detail page still exposes the full row. This can change as new abilities are added.
 *
 * What an ability actually *is* is the buffs it applies, so those get both a linked-pill column and
 * a consolidated stat column, exactly as food does.
 */
export const AbilityDefs: BitCraftToDataDef<AbilityCustomDesc> = {
    columns: [
        headerColumn<AbilityCustomDesc, any>({
            accessor: {accessorKey: "abilityName"},
            route: ability => ["ability", ability.id],
            prefixElement: ability => (
                <GameIcon name={ability.abilityName} iconAsset={ability.iconPath} shape="tall" small noInteract/>
            ),
        }),
        descriptionColumn<AbilityCustomDesc>(),
        buffsColumn<AbilityCustomDesc>({accessorKey: "buffs"}),
        buffStatsColumn<AbilityCustomDesc>({accessorKey: "buffs"}, "Buff Stats", msg`Buff Stats`),
        {
            id: "Stamina Cost", meta: {label: gameText(msg`Stamina Cost`)}, accessorKey: "staminaCost",
            filterFn: "inNumberRange",
        },
        {
            id: "Cooldown", meta: {label: gameText(msg`Cooldown`)}, accessorKey: "cooldown",
            cell: p => readableSeconds(p.getValue()),
            filterFn: "inNumberRange",
        },
        {
            id: "Required Buff", meta: {label: msg`Required Buff`},
            accessorFn: buffNames,
            getUniqueValues: a => buffNames(a) ?? [],
            filterFn: "arrIncludesSome",
            sortUndefined: "last",
            cell: props => <Show when={props.row.original.requiredBuffIds?.length}>
                <LinkedList>
                    {props.row.original.requiredBuffIds!.map(id => <BuffLinkById buffId={id}/>)}
                </LinkedList>
            </Show>,
        },
        boolColumn<AbilityCustomDesc, boolean>("Consume Required Buff", {accessorKey: "consumeRequiredBuff"}, msg`Consume Required Buff`),
        {
            id: "Required Items", meta: {label: msg`Required Items`},
            accessorFn: a => a.inputItemStacks?.map(stackName),
            getUniqueValues: a => a.inputItemStacks?.map(stackName) ?? [],
            filterFn: "arrIncludesSome",
            sortUndefined: "last",
            cell: props => <Show when={props.row.original.inputItemStacks?.length}>
                <LinkedList>
                    {props.row.original.inputItemStacks!.map(s => <ItemStackLink stack={s}/>)}
                </LinkedList>
            </Show>,
        },
        {
            id: "Output Items", meta: {label: msg`Output Items`},
            accessorFn: a => outputStacks(a).map(stackName),
            getUniqueValues: a => outputStacks(a).map(stackName),
            filterFn: "arrIncludesSome",
            cell: props => <Show when={outputStacks(props.row.original).length}>
                <LinkedList>
                    {outputStacks(props.row.original).map(s => <ItemStackLink stack={s}/>)}
                </LinkedList>
            </Show>,
        },
        {
            id: "Spawned Placeables", meta: {label: msg`Spawned Placeables`},
            accessorFn: placeableNames,
            getUniqueValues: a => placeableNames(a) ?? [],
            filterFn: "arrIncludesSome",
            sortUndefined: "last",
            cell: props => <Show when={props.row.original.spawnedPlaceables?.length}>
                <LinkedList>
                    {props.row.original.spawnedPlaceables!.map(sp => <PlaceableLinkById id={sp.placeableId}/>)}
                </LinkedList>
            </Show>,
        },
        {
            id: "Profession Hit", meta: {label: msg`Profession Hit`},
            accessorFn: a => {
                const id = professionHitSkillId(a);
                return id === undefined ? undefined : sourceRow(BitCraftTables.SkillDesc.indexedBy("id")().get(id))?.name ?? `Skill #${id}`;
            },
            cell: props => <Show when={professionHitSkillId(props.row.original)}>
                {id => <SkillLinkById skillId={id()}/>}
            </Show>,
        },
        {
            id: "Profession Hit Bonus", meta: {label: msg`Profession Hit Bonus`},
            accessorFn: a => professionHitSkillId(a) === undefined ? undefined : a.professionHitBonusDamage,
            filterFn: "inNumberRange",
        },
        rowActions(undefined, "ability"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Buffs", msg`Buffs`, compareOptions),
        statsFilter("Buff Stats", msg`Buff Stats`),
        rangeFilter("Stamina Cost", gameText(msg`Stamina Cost`)),
        rangeFilter("Cooldown", gameText(msg`Cooldown`)),
        boolFilter("Consume Required Buff", msg`Consume Required Buff`),
        uniqueValuesFilter("Profession Hit", msg`Profession Hit`, compareOptions),
        rangeFilter("Profession Hit Bonus", msg`Profession Hit Bonus`),
    ],
    searchColumns: ["Name", "Description", "Required Buff", "Input Items", "Output Items", "Spawned Placeables"],
};
