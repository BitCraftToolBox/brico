import {CargoDesc} from "~/bindings/src/cargo_desc_type";
import {CargoIcon} from "~/components/shared/GameIcon";
import {BitCraftTables} from "~/lib/spacetime";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {
    descriptionColumn,
    headerColumn,
    rangeFilter,
    rarityColumn,
    rarityFilter,
    rowActions,
    tagColumn,
    tagFilter,
    tierColumn,
    tierFilter
} from "~/lib/table-utils/column-builders";


export const CargoDescDefs: BitCraftToDataDef<CargoDesc> = {
    columns: [
        headerColumn({
            route: cargo => ["cargo", cargo.id],
            prefixElement: cargo => <CargoIcon cargo={cargo} small/>
        }),
        tagColumn(),
        tierColumn(),
        rarityColumn(),
        {
            id: "Supply",
            accessorFn: (cargo: CargoDesc) => BitCraftTables.BuildingRepairsDesc.indexedBy("cargoId")?.()?.get(cargo.id)?.repairValue,
            filterFn: 'inNumberRange',
            sortUndefined: 'last'
        },
        descriptionColumn(),
        rowActions(undefined, "cargo"),
    ],
    facetedFilters: [
        tagFilter(),
        tierFilter(),
        rarityFilter(),
        rangeFilter("Supply"),
    ],
    searchColumns: ["Name", "Description"],
}