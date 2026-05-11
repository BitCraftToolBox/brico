import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import {CollectibleIcon, ItemIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    boolColumn,
    boolFilter,
    descriptionColumn,
    headerColumn,
    rarityColumn,
    rarityFilter,
    rowActions,
    tagColumn,
    tagFilter,
    uniqueValuesFilter
} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const CollectibleDefs: BitCraftToDataDef<CollectibleDesc> = {
    columns: [
        headerColumn({
            route: coll => ["collectible", coll.id],
            prefixElement: coll => coll.iconAssetName ? <CollectibleIcon collectible={coll} small/> : <></>,
        }),
        descriptionColumn(),
        {
            id: "Item Deed",
            accessorKey: "itemDeedId",
            cell: (props) => {
                const itemIdx = BitCraftTables.ItemDesc.indexedBy("id");
                const item = props.getValue();
                if (!item) return <></>;
                const itemDesc = itemIdx?.()?.get(item);
                return itemDesc ? <ItemIcon item={itemDesc} small/> : <></>;
            },
        },
        tagColumn(),
        {id: "Type", accessorKey: "collectibleType.tag", filterFn: includedIn<CollectibleDesc>()},
        rarityColumn({accessorKey: "collectibleRarity.tag"}),
        boolColumn("Auto Collect", {accessorKey: "autoCollect"}),
        boolColumn("Locked", {accessorKey: "locked"}),
        rowActions(undefined, "col"),
    ],
    facetedFilters: [
        tagFilter(),
        uniqueValuesFilter("Type"),
        rarityFilter(),
        boolFilter("Auto Collect"),
        boolFilter("Locked"),
    ],
    searchColumns: ["Name", "Description"],
};
