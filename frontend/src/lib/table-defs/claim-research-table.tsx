import {msg} from "@lingui/core/macro";
import {ClaimTechDesc} from "~/bindings/src/claim_tech_desc_type";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {descriptionColumn, headerColumn, rowActions, tierColumn, tierFilter, uniqueValuesFilter} from "~/lib/table-utils/column-builders";
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
        rowActions(),
    ],
    facetedFilters: [
        // this isn't exposed in the client, so don't attempt to translate it - no-op the labelFn to identity
        uniqueValuesFilter("Type", msg`Type`, undefined, undefined, s => s),
        tierFilter(),
    ],
    searchColumns: ["Name", "Description"],
};
