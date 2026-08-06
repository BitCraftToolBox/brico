import {msg} from "@lingui/core/macro";
import {CellContext} from "@tanstack/solid-table";
import {JSX} from "solid-js";
import {CollectibleDesc} from "~/bindings/src/collectible_desc_type";
import type CollectibleType from "~/bindings/src/collectible_type_type";
import {CollectibleIcon, ItemIcon} from "~/components/shared/GameIcon";
import {collectibleTypeLabel} from "~/lib/game-strings";
import {gameText} from "~/lib/labels";
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
            meta: {label: gameText(msg`Deed`)},
            accessorKey: "itemDeedId",
            cell: (props) => {
                const item = props.getValue();
                if (!item) return <></>;
                const itemDesc = BitCraftTables.ItemDesc.indexedBy("id")().get(item);
                return itemDesc ? <ItemIcon item={itemDesc} small/> : <></>;
            },
        },
        tagColumn(),
        {
            id: "Type",
            meta: {label: msg`Type`},
            accessorKey: "collectibleType.tag",
            cell: (props: CellContext<any, CollectibleType["tag"]>): JSX.Element => collectibleTypeLabel(props.getValue()),
            filterFn: includedIn<CollectibleDesc>()
        },
        rarityColumn({accessorKey: "collectibleRarity.tag"}),
        boolColumn("Auto Collect", {accessorKey: "autoCollect"}, msg`Auto Collect`),
        boolColumn("Locked", {accessorKey: "locked"}, msg`Locked`),
        rowActions(undefined, "col"),
    ],
    facetedFilters: [
        tagFilter(),
        uniqueValuesFilter("Type", msg`Type`),
        rarityFilter(),
        boolFilter("Auto Collect", msg`Auto Collect`),
        boolFilter("Locked", msg`Locked`),
    ],
    searchColumns: ["Name", "Description"],
};
