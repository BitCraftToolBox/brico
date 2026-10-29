import {EnemyDesc, ItemDesc, ItemListDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {JSX} from "solid-js";
import {EnemyIcon, ItemIcon} from "~/components/shared/GameIcon";
import {ItemListDisplay} from "~/components/shared/ItemStacks";
import {getItemListOwner, getItemListSources, ItemListOwner} from "~/lib/relations";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {type DetailRoute, headerColumn, rarityColumn, rarityFilter, rowActions, tagColumn, tagFilter, tierColumn, tierFilter} from "~/lib/table-utils/column-builders";

function listOwner(list: ItemListDesc): ItemListOwner | undefined {
    return getItemListOwner(getItemListSources(list));
}

function listToItem(list: ItemListDesc): ItemDesc | undefined {
    const owner = listOwner(list);
    return owner?.type === "Item" ? owner.item : undefined;
}

/**
 * Row-click target for an item list: whichever object *owns* the list, opened on the tab that
 * already renders the list's contents — the item page's "Item List" tab or the creature page's
 * "Contribution Loot" tab. Only a list with no resolvable owner falls back to its own page, which
 * is the case that page continues to exist for.
 */
function itemListRoute(list: ItemListDesc): DetailRoute {
    const owner = listOwner(list);
    switch (owner?.type) {
        case "Item":
            return ["item", owner.item.id, "item-list"];
        case "Enemy":
            return ["creature", owner.enemy.enemyType, "loot"];
    }
    return ["item-list", list.id];
}

function listToEnemy(list: ItemListDesc): EnemyDesc | undefined {
    const owner = listOwner(list);
    return owner?.type === "Enemy" ? owner.enemy : undefined;
}

function ownerDesc(list: ItemListDesc): ItemDesc | EnemyDesc | undefined {
    const owner = listOwner(list);
    return owner?.type === "Item" ? owner.item : owner?.enemy;
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
                const enemy = listToEnemy(list);
                return enemy ? <EnemyIcon enemy={enemy} small noInteract/> : <></>;
            },
        }),
        tagColumn(undefined, {accessorFn: (list) => listToItem(list)?.tag ?? ""}),
        tierColumn({accessorFn: (list) => ownerDesc(list)?.tier ?? -1}),
        rarityColumn({accessorFn: (list) => ownerDesc(list)?.rarity.tag ?? "Default"}),
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
                    const enemy = listToEnemy(props.row.original);
                    if (enemy) originalIcon = <EnemyIcon enemy={enemy} small noInteract/>;
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
