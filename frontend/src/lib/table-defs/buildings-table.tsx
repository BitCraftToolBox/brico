import {msg} from "@lingui/core/macro";
import {ColumnDef} from "@tanstack/solid-table";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {BuildingFunction} from "~/bindings/src/building_function_type";
import {BuildingIcon} from "~/components/shared/GameIcon";
import {getBuildingTier} from "~/lib/bitcraft-utils";
import {sourceRow, translateGameText} from "~/lib/data-translation";
import {Label} from "~/lib/labels";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareOptions, includedIn} from "~/lib/utils";


type NumericBuildingProp = Extract<keyof BuildingFunction, string> &
    { [K in keyof BuildingFunction]: BuildingFunction[K] extends number ? K : never }[keyof BuildingFunction];

const fromFunctionProp = (
    title: string,
    prop: NumericBuildingProp,
    filter: ColumnDef<BuildingDesc, number>["filterFn"] = includedIn(),
    label: Label | string = title,
): ColumnDef<BuildingDesc, number | undefined> => {
    return {
        id: title,
        meta: {label},
        accessorFn: (bldg: BuildingDesc) =>
            bldg.functions.find(func => func[prop] > 0)?.[prop],
        filterFn: filter,
        sortUndefined: 'last'
    };
}

/** Canonical English function-type names for a building. */
function buildingTypeNames(bldg: BuildingDesc): string[] {
    const bldgTypes = BitCraftTables.BuildingTypeDesc.indexedBy("id");
    return bldg.functions.map(func => sourceRow(bldgTypes().get(func.functionType))?.name || "Unknown");
}

export const BuildingDescDefs: BitCraftToDataDef<BuildingDesc> = {
    columns: [
        headerColumn({
            route: bldg => ["building", bldg.id],
            prefixElement: bldg => <BuildingIcon building={bldg} small/>
        }),
        {
            id: "Type",
            meta: {label: msg`Type`},
            // English value — this column is filterable, so it ends up in shared URLs.
            // See the note at the top of table-utils/column-builders.tsx.
            accessorFn: (bldg: BuildingDesc) => buildingTypeNames(bldg),
            getUniqueValues: (bldg: BuildingDesc) => buildingTypeNames(bldg),
            cell: props => (props.getValue() as string[]).map(translateGameText).join(", "),
            filterFn: "arrIncludesSome"
        },
        tierColumn({accessorFn: getBuildingTier}),
        fromFunctionProp("Item Slots", "storageSlots", "inNumberRange", msg`Item Slots`),
        {
            id: "Item Stack Size",
            meta: {label: msg`Item Stack Size`},
            accessorFn: (bldg: BuildingDesc) => {
                // this ensures we get the slot size of the function used for finding slots above
                // if a building ever has multiple inventory functions of the same item type,
                // these might need to switch to arrays or something
                const storageIndex = bldg.functions
                    .findIndex(func => func.storageSlots > 0);
                if (storageIndex == -1) return undefined;
                return bldg.functions[storageIndex].itemSlotSize / 6000;
            },
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: "last"
        },
        fromFunctionProp("Cargo Slots", "cargoSlots", "inNumberRange", msg`Cargo Slots`),
        {
            id: "Cargo Stack Size",
            meta: {label: msg`Cargo Stack Size`},
            accessorFn: (bldg: BuildingDesc) => {
                // as above
                const stockpileIndex = bldg.functions
                    .findIndex(func => func.cargoSlots > 0);
                if (stockpileIndex == -1) return undefined;
                return bldg.functions[stockpileIndex].cargoSlotSize / 6000;
            },
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: "last"
        },
        fromFunctionProp("Trade Orders", "tradeOrders", undefined, msg`Trade Orders`),
        fromFunctionProp("Crafts per Player", "concurrentCraftsPerPlayer", undefined, msg`Crafts per Player`),
        {
            id: "Crafting Slots",
            meta: {label: msg`Crafting Slots`},
            accessorFn: (bldg: BuildingDesc) => {
                const func = bldg.functions.find(func => func.craftingSlots > 0 || func.refiningSlots > 0 || func.refiningCargoSlots > 0);
                if (!func) return undefined;
                // as of now, no building can be used for both active and passive crafting
                // if that changes, these might need to be split up into separate columns
                return func.refiningCargoSlots + func.refiningSlots + func.craftingSlots;
            },
            filterFn: includedIn<BuildingDesc>(),
            sortUndefined: "last"
        },
        fromFunctionProp("Housing Slots", "housingSlots", undefined, msg`Housing Slots`),
        fromFunctionProp("Housing Income", "housingIncome", undefined, msg`Housing Income`),
        rowActions(undefined, "build"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Type", msg`Type`, compareOptions),
        tierFilter(),
        rangeFilter("Item Slots", msg`Item Slots`),
        uniqueValuesFilter("Item Stack Size", msg`Item Stack Size`, compareOptions),
        rangeFilter("Cargo Slots", msg`Cargo Slots`),
        uniqueValuesFilter("Cargo Stack Size", msg`Cargo Stack Size`, compareOptions),
        uniqueValuesFilter("Trade Orders", msg`Trade Orders`, compareOptions),
        uniqueValuesFilter("Crafting Slots", msg`Crafting Slots`, compareOptions),
        uniqueValuesFilter("Housing Slots", msg`Housing Slots`, compareOptions),
        uniqueValuesFilter("Housing Income", msg`Housing Income`, compareOptions),
    ],
    searchColumns: ["Name"],
}