import {ColumnDef} from "@tanstack/solid-table";
import {BuildingDesc} from "~/bindings/src/building_desc_type";
import {BuildingFunction} from "~/bindings/src/building_function_type";
import {BuildingIcon} from "~/components/shared/GameIcon";
import {getBuildingTier} from "~/lib/bitcraft-utils";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {compareOptions, includedIn} from "~/lib/utils";


type NumericBuildingProp = Extract<keyof BuildingFunction, string> &
    { [K in keyof BuildingFunction]: BuildingFunction[K] extends number ? K : never }[keyof BuildingFunction];

const fromFunctionProp = (
    title: string,
    prop: NumericBuildingProp,
    filter: ColumnDef<BuildingDesc, number>["filterFn"] = includedIn()
): ColumnDef<BuildingDesc, number | undefined> => {
    return {
        id: title,
        accessorFn: (bldg: BuildingDesc) =>
            bldg.functions.find(func => func[prop] > 0)?.[prop],
        filterFn: filter,
        sortUndefined: 'last'
    };
}

export const BuildingDescDefs: BitCraftToDataDef<BuildingDesc> = {
    columns: [
        headerColumn({
            route: bldg => ["building", bldg.id],
            prefixElement: bldg => <BuildingIcon building={bldg} small/>
        }),
        {
            id: "Type",
            accessorFn: (bldg: BuildingDesc) => {
                const bldgTypes = BitCraftTables.BuildingTypeDesc.indexedBy("id");
                return bldg.functions.map(func => bldgTypes()!.get(func.functionType)?.name || "Unknown");
            },
            getUniqueValues: (bldg: BuildingDesc) => {
                const bldgTypes = BitCraftTables.BuildingTypeDesc.indexedBy("id");
                return bldg.functions.map(func => bldgTypes()!.get(func.functionType)?.name || "Unknown");
            },
            filterFn: "arrIncludesSome"
        },
        tierColumn({accessorFn: getBuildingTier}),
        fromFunctionProp("Item Slots", "storageSlots", "inNumberRange"),
        {
            id: "Item Stack Size",
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
        fromFunctionProp("Cargo Slots", "cargoSlots", "inNumberRange"),
        {
            id: "Cargo Stack Size",
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
        fromFunctionProp("Trade Orders", "tradeOrders"),
        fromFunctionProp("Crafts per Player", "concurrentCraftsPerPlayer"),
        {
            id: "Crafting Slots",
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
        fromFunctionProp("Housing Slots", "housingSlots"),
        fromFunctionProp("Housing Income", "housingIncome"),
        rowActions(undefined, "build"),
    ],
    facetedFilters: [
        uniqueValuesFilter("Type", undefined, compareOptions),
        tierFilter(),
        rangeFilter("Item Slots"),
        uniqueValuesFilter("Item Stack Size", undefined, compareOptions),
        rangeFilter("Cargo Slots"),
        uniqueValuesFilter("Cargo Stack Size", undefined, compareOptions),
        uniqueValuesFilter("Trade Orders", undefined, compareOptions),
        uniqueValuesFilter("Crafting Slots", undefined, compareOptions),
        uniqueValuesFilter("Housing Slots", undefined, compareOptions),
        uniqueValuesFilter("Housing Income", undefined, compareOptions),
    ],
    searchColumns: ["Name"],
}