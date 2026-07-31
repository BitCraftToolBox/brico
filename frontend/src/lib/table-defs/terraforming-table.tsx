import {msg} from "@lingui/core/macro";
import {CellContext} from "@tanstack/solid-table";
import {JSX} from "solid-js";
import {ProbabilisticItemStack} from "~/bindings/src/probabilistic_item_stack_type";
import {TerraformRecipeDesc} from "~/bindings/src/terraform_recipe_desc_type";
import {ProbabilisticItemStackArray} from "~/components/shared/ItemStacks";
import {BitCraftToDataDef} from "~/lib/table-utils/base";
import {headerColumn, rangeFilter, rowActions} from "~/lib/table-utils/column-builders";

export const TerraformingDefs: BitCraftToDataDef<TerraformRecipeDesc> = {
    columns: [
        headerColumn({
            title: "Difference",
            label: msg`Difference`,
            accessor: {accessorKey: "difference"},
            route: terraform => ["terraforming", terraform.difference],
        }),
        {id: "Effort", meta: {label: msg`Effort`}, accessorKey: "actionsCount", filterFn: "inNumberRange"},
        {
            id: "Drops", meta: {label: msg`Drops`}, accessorKey: "outputItemStacks",
            cell: (props: CellContext<TerraformRecipeDesc, ProbabilisticItemStack[] | undefined>): JSX.Element => {
                const v = props.getValue();
                if (typeof v === "undefined") return <>No Outputs</>;
                return <ProbabilisticItemStackArray stacks={v}/>;
            },
        },
        rowActions(),
    ],
    facetedFilters: [
        rangeFilter("Difference", msg`Difference`),
        rangeFilter("Effort", msg`Effort`)
    ],
};
