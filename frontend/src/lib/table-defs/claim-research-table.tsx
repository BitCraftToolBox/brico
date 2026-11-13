import {ClaimTechDesc} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {boolColumn, boolFilter, descriptionColumn, headerColumn, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
import {includedIn} from "~/lib/utils";

export const ClaimResearchDefs: BitCraftToDataDef<ClaimTechDesc> = {
    columns: [
        headerColumn({
            route: tech => ["claim-research", tech.id],
        }),
        descriptionColumn(),
        {id: "Type", meta: {label: msg`Type`}, accessorKey: "techType.tag", filterFn: includedIn<ClaimTechDesc>()},
        tierColumn(),
        {id: "Supply Cost", meta: {label: msg`Supply Cost`}, accessorKey: "suppliesCost", filterFn: "inNumberRange"},
        {id: "Members", meta: {label: msg`Members`}, accessorKey: "members", filterFn: "inNumberRange"},
        {id: "Area", meta: {label: msg`Area`}, accessorKey: "area", filterFn: "inNumberRange"},
        {id: "Supply Cap", meta: {label: msg`Supply Cap`}, accessorKey: "supplies", filterFn: "inNumberRange"},
        boolColumn<ClaimTechDesc, boolean>("Researchable", {accessorFn: r => !r.cannotBeResearched}, msg`Researchable`),
        boolColumn<ClaimTechDesc, boolean>("Hidden", {accessorKey: "notShownInUi"}, msg`Hidden`),
        rowActions(),
    ],
    facetedFilters: [
        // this isn't exposed in the client, so don't attempt to translate it - no-op the labelFn to identity
        uniqueValuesFilter("Type", msg`Type`, undefined, undefined, s => s),
        tierFilter(),
        boolFilter("Researchable", msg`Researchable`),
        boolFilter("Hidden", msg`Hidden`),
    ],
    searchColumns: ["Name", "Description"],
};
