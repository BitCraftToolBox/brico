import {msg} from "@lingui/core/macro";
import {JSX} from "solid-js";
import {ItemDesc} from "~/bindings/src/item_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {EnemyIcon, ItemIcon} from "~/components/shared/GameIcon";
import {ItemListDisplay} from "~/components/shared/ItemStacks";
import {getItemListSource} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {type DetailRoute, headerColumn, rarityColumn, rarityFilter, rowActions, tagColumn, tagFilter, tierColumn, tierFilter} from "~/lib/table-utils/column-builders";

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

/**
 * Row-click target for an item list: whichever object *owns* the list, opened on the tab that
 * already renders the list's contents — the item page's "Item List" tab or the creature page's
 * "Contribution Loot" tab. Only a list with no resolvable owner falls back to its own page, which
 * is the case that page continues to exist for.
 */
function itemListRoute(list: ItemListDesc): DetailRoute {
    const source = getItemListSource(list);
    switch (source.type) {
        case "Item":
            return ["item", source.item.id, "item-list"];
        case "Enemy":
            if (source.enemy) return ["creature", source.enemy.enemyType, "loot"];
    }
    return ["item-list", list.id];
}

export const ItemListDescDefs: BitCraftToDataDef<ItemListDesc> = {
    columns: [
        headerColumn({
            route: itemListRoute,
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
                    const matchedEnemy = enemyIndex().get(matchedLoot.enemyTypeId);
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
            meta: {label: msg`Possible Items`},
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
                        const matchedEnemy = enemyIndex().get(matchedLoot.enemyTypeId);
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
