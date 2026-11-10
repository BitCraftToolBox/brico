import {PremiumItemDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {GameIcon} from "~/components/shared/GameIcon";
import {HexiteShardPrice} from "~/components/shared/HexiteShardPrice.tsx";
import {premiumItemTypeLabel, premiumItemTypes} from "~/lib/premium-items";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolColumn, boolFilter, descriptionColumn, headerColumn, rangeFilter, rowActions, uniqueValuesFilter} from "~/lib/table-utils/column-builders";

export const PremiumItemDefs: BitCraftToDataDef<PremiumItemDesc> = {
    columns: [
        headerColumn({
            route: item => ["premium-item", item.id],
            prefixElement: item => <GameIcon name={item.name} iconAsset={item.imageAddress} shape="square" small noInteract/>,
        }),
        descriptionColumn(),
        {
            id: "Type",
            meta: {label: msg`Type`},
            // Canonical English values (filter state / shared URLs), translated for display —
            // see the note at the top of table-utils/column-builders.tsx.
            accessorFn: item => premiumItemTypes(item),
            getUniqueValues: item => premiumItemTypes(item),
            cell: props => <>{premiumItemTypes(props.row.original).map(premiumItemTypeLabel).join(", ")}</>,
            filterFn: "arrIncludesSome",
        },
        {
            id: "Price", meta: {label: msg`Price`}, accessorKey: "price", filterFn: "inNumberRange",
            cell: props => <HexiteShardPrice amount={props.row.original.price}/>,
        },
        {
            id: "Base Price", meta: {label: msg`Base Price`}, accessorKey: "basePrice", filterFn: "inNumberRange",
            cell: props => <HexiteShardPrice amount={props.row.original.basePrice}/>,
        },
        {id: "Quantity", meta: {label: msg`Quantity`}, accessorKey: "quantity"},
        boolColumn("Enabled", {accessorKey: "isEnabled"}, msg`Enabled`),
        {id: "Sort Priority", meta: {label: msg`Sort Priority`}, accessorKey: "sortingPriority"},
        rowActions(),
    ],
    facetedFilters: [
        uniqueValuesFilter("Type", msg`Type`, undefined, undefined, premiumItemTypeLabel),
        rangeFilter("Price", msg`Price`),
        boolFilter("Enabled", msg`Enabled`),
    ],
    searchColumns: ["Name", "Description"],
};
