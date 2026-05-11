import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import {Rarity} from "~/bindings/src/rarity_type";
import {ItemIcon} from "~/components/shared/GameIcon";
import {SkillLinkById} from "~/lib/game-links";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rarityColumn, rarityFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {statsColumn, statsFilter} from "~/lib/table-utils/stats-column-builder";
import {includedIn, splitCamelCase} from "~/lib/utils";

export const EquipmentDefs: BitCraftToDataDef<EquipmentDesc> = {
    columns: [
        headerColumn<EquipmentDesc, any>({
            title: "Name",
            accessor: {accessorFn: eq => BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(eq.itemId)?.name ?? `Item #${eq.itemId}`},
            route: eq => ["equipment", eq.itemId],
            prefixElement: eq => {
                const item = BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(eq.itemId);
                return item ? <ItemIcon item={item} small noInteract/> : <></>;
            },
        }),
        {
            id: "Slots",
            accessorFn: row => row.slots?.map(s => splitCamelCase(s.tag)).join(", ") ?? "",
            filterFn: includedIn<EquipmentDesc>(),
        },
        {
            id: "Skill",
            accessorFn: row => {
                if (!row.levelRequirement) return undefined;
                if (!row.levelRequirement.skillId) return undefined;
                const skill = BitCraftTables.SkillDesc.indexedBy("id")?.()?.get(row.levelRequirement.skillId);
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
            accessorFn: row => row.levelRequirement?.level,
            filterFn: "inNumberRange",
        },
        statsColumn<EquipmentDesc>(),
        tierColumn({accessorFn: equip => BitCraftTables.ItemDesc.indexedBy("id")?.().get(equip.itemId)?.tier ?? -1}),
        rarityColumn({accessorFn: equip => BitCraftTables.ItemDesc.indexedBy("id")?.().get(equip.itemId)?.rarity.tag ?? Rarity.Default.tag as Rarity["tag"]}), // idk why TS needs this
        rowActions({accessorKey: "itemId"}, "item"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Slots"),
        uniqueValuesFilter("Skill"),
        rangeFilter("Level"),
        statsFilter("Stats"),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"],
};
