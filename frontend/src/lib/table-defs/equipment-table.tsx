import {msg} from "@lingui/core/macro";
import {For} from "solid-js";
import {BuffDesc} from "~/bindings/src/buff_desc_type";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {sourceRow} from "~/lib/data-translation";
import {BuffLink, SkillLinkById} from "~/lib/game-links";
import {equipmentSlotLabel, equipmentSlotName} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef, resolveAccessor} from "~/lib/table-utils/base";
import {
    buffsColumn,
    buffStatsColumn,
    headerColumn,
    rangeFilter,
    rarityColumn,
    rarityFilter,
    rowActions,
    tierColumn,
    tierFilter,
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {compareOptions, fixFloat, includedIn, readableSeconds} from "~/lib/utils";


const equipToBuffEffect = {accessorFn: (eq: EquipmentDesc) => {
    const buffId = eq.equipmentBuffId;
    if (buffId) {
        return [
            {buffId, duration: undefined} satisfies BuffEffect
        ];
    }
    return undefined;
}};

export const EquipmentDefs: BitCraftToDataDef<EquipmentDesc> = {
    columns: [
        headerColumn<EquipmentDesc, any>({
            title: "Name",
            accessor: {accessorFn: eq => BitCraftTables.ItemDesc.indexedBy("id")().get(eq.itemId)?.name ?? `Item #${eq.itemId}`},
            // Row-click goes to the item page, not a dedicated equipment page: it renders a
            // superset of these fields inline. See `DetailRoute` in table-utils/column-builders.
            route: eq => ["item", eq.itemId],
            prefixElement: eq => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")().get(eq.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {
            id: "Slots",
            meta: {label: msg`Slots`},
            // Canonical English slot names as the value (filter state / shared URLs), translated
            // for display — see the note at the top of table-utils/column-builders.tsx.
            accessorFn: row => row.slots?.map(s => equipmentSlotName(s.tag)) ?? [],
            getUniqueValues: row => row.slots?.map(s => equipmentSlotName(s.tag)) ?? [],
            // Wrapped in a JSX child so the translation stays reactive on a data-locale switch.
            cell: ctx => <>{ctx.row.original.slots?.map(s => equipmentSlotLabel(s.tag)).join(", ") ?? ""}</>,
            filterFn: 'arrIncludesSome',
        },
        {
            id: "Skill",
            meta: {label: gameText(msg`Skill`)},
            accessorFn: row => {
                if (!row.levelRequirement) return undefined;
                if (!row.levelRequirement.skillId) return undefined;
                // English value; the cell renders SkillLinkById, which localizes for display.
                const skill = sourceRow(BitCraftTables.SkillDesc.indexedBy("id")().get(row.levelRequirement.skillId));
                return skill?.name ?? `#${row.levelRequirement.skillId}`;
            },
            cell: (props) => {
                const row = props.row.original;
                if (!row.levelRequirement?.skillId) return <></>;
                return <SkillLinkById skillId={row.levelRequirement.skillId}/>;
            },
            filterFn: includedIn<EquipmentDesc>(),
        },
        {
            id: "Level",
            meta: {label: gameText(msg`Level`)},
            accessorFn: row => row.levelRequirement?.level,
            filterFn: "inNumberRange",
        },
        statsColumn<EquipmentDesc>(),
        {
            ...buffsColumn<EquipmentDesc>(equipToBuffEffect), cell: (props) => {
                const buffs = resolveAccessor(equipToBuffEffect, props.row.original);
                if (!buffs?.length) return undefined;
                return (
                    <div class="flex flex-wrap gap-1">
                        <For each={buffs.map(b => [b, BitCraftTables.BuffDesc.indexedBy("id")().get(b.buffId)] as [BuffEffect, BuffDesc | undefined]).filter((b): b is [BuffEffect, BuffDesc] => !!b[1])}>
                            {buff => <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">
                                <BuffLink buffId={buff[0].buffId} label={buff[1].description} class="font-medium" showIcon={false}/>
                                <span class="opacity-70">{readableSeconds(buff[0].duration ?? buff[1].duration)}</span>
                                <span class="opacity-70">({fixFloat(props.row.original.equipmentBuffChancePerHit * 100)}%)</span>
                            </span>}
                        </For>
                    </div>
                );
            },
        },
        buffStatsColumn<EquipmentDesc>(equipToBuffEffect),
        tierColumn({accessorFn: equip => BitCraftTables.ItemDesc.indexedBy("id")().get(equip.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: equip => BitCraftTables.ItemDesc.indexedBy("id")().get(equip.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Slots", msg`Slots`, undefined, undefined, equipmentSlotLabel),
        uniqueValuesFilter("Skill", gameText(msg`Skill`)),
        rangeFilter("Level", gameText(msg`Level`)),
        statsFilter(),
        uniqueValuesFilter("Buffs", msg`Buffs`, compareOptions),
        statsFilter("Buff Stats", msg`Buff Stats`),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"],
};
