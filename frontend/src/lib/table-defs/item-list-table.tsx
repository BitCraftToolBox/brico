import {JSX} from "solid-js";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {EnemyIcon, ItemIcon} from "~/components/shared/GameIcon";
import {ItemListDisplay} from "~/components/shared/ItemStacks";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rarityColumn, rarityFilter, rowActions, tagColumn, tagFilter, tierColumn, tierFilter} from "~/lib/table-utils/column-builders";

function listToItem(list: ItemListDesc): ItemDesc | undefined {
    const items = BitCraftTables.ItemDesc.indexedByMulti("itemListId")().get(list.id);
    if (items && items.length >= 1) {
        let item = items[0];
        // TODO this is the only current case where the item we want isn't the first one. but man is this ugly.
        if (list.id === 1096831250) item = items.find(i => i.id === 1753489769) ?? item;
        return item;
    }
    return undefined;
}

export const ItemListDescDefs: BitCraftToDataDef<ItemListDesc> = {
    columns: [
        headerColumn({
            route: list => ["item-list", list.id],
            customRender: (val: JSX.Element) => <div class="text-wrap">{val}</div>,
            prefixElement: list => {
                let item = listToItem(list);
                if (item) {
                    return <ItemIcon item={item} small noInteract/>;
                }
                // NB should also be multi but doesn't happen in practice
                const lootDescs = BitCraftTables.ContributionLootDesc.indexedBy("itemListId");
                const matchedLoot = lootDescs().get(list.id);
                if (matchedLoot) {
                    const enemyIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType");
                    const matchedEnemy = enemyIndex()?.get(matchedLoot.enemyTypeId);
                    if (matchedEnemy) return <EnemyIcon enemy={matchedEnemy} small noInteract/>
                }
                return <></>;
            },
        }),
        tagColumn(undefined, {accessorFn: (list) => listToItem(list)?.tag ?? ""}),
        tierColumn({accessorFn: (list) => listToItem(list)?.tier ?? -1}),
        rarityColumn({accessorFn: (list) => listToItem(list)?.rarity.tag ?? "Default"}),
        {
            id: "Possible Items",
            accessorFn: (row) => row,
            cell: (props) => {
                let originalIcon: JSX.Element | undefined = undefined;
                let item = listToItem(props.row.original);
                if (item) {
                    originalIcon = <ItemIcon item={item} small noInteract/>;
                } else {
                    // NB should also be multi but doesn't happen in practice
                    const lootDescs = BitCraftTables.ContributionLootDesc.indexedBy("itemListId");
                    const matchedLoot = lootDescs().get(props.row.original.id);
                    if (matchedLoot) {
                        const enemyIndex = BitCraftTables.EnemyDesc.indexedBy("enemyType");
                        const matchedEnemy = enemyIndex()?.get(matchedLoot.enemyTypeId);
                        if (matchedEnemy) originalIcon = <EnemyIcon enemy={matchedEnemy} small noInteract/>;
                    }
                }
                return <ItemListDisplay
                    itemList={props.row.original}
                    originalIcon={originalIcon ? () => originalIcon : undefined}
                />
            },
        },
        rowActions(),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter()
    ],
    searchColumns: ["Name"],
}
