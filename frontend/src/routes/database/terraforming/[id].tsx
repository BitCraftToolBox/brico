import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ProbabilisticItemStackArray} from "~/components/shared/ItemStacks";
import {breadcrumb} from "~/lib/game-links";
import {toolReqPair} from "~/lib/recipe-sources";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function TerraformingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.TerraformRecipeDesc);
    const index = BitCraftTables.TerraformRecipeDesc.indexedBy("difference");
    const toolIndex = BitCraftTables.ToolTypeDesc.indexedBy("id");

    const recipe = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const tool = createMemo(() => {
        const r = recipe();
        if (!r) return undefined;
        if (!r.toolRequirement) return undefined;
        return toolReqPair(r.toolRequirement, toolIndex());
    })

    return (
        <DetailPageLayout
            title={"Elevation ±" + recipe()?.difference}
            breadcrumb={breadcrumb("/database/terraforming")}
            loading={isLoading() && !recipe()}
            icon={<FontIcon codepoint="0034" class="size-8"/>}
            name={"Terraform Difference " + recipe()?.difference}
            description={"Elevation difference calculated from original world gen elevation."}
            details={[
                {label: "Effort", value: recipe()?.actionsCount},
                {label: "Stamina", value: recipe()?.staminaPerAction},
                {label: "Time", value: recipe()?.timePerAction},
                {label: "Tool", value: tool() ? tool()![1] : undefined},
            ]}
            rawData={recipe()}
            spacetimeTable={BitCraftTables.TerraformRecipeDesc.st_name}
            objectId={recipe()?.difference}
            tabs={[
                {
                    id: "drops",
                    label: "Dropped Items",
                    count: recipe()?.outputItemStacks?.length ?? 0,
                    showWhenEmpty: false,
                    content: () => <Show when={recipe()?.outputItemStacks?.length}>
                        <ProbabilisticItemStackArray stacks={recipe()?.outputItemStacks!}/>
                    </Show>,
                },
            ]}
        />
    );
}
