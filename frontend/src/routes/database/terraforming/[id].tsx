import {msg, t} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ProbabilisticItemStackArray} from "~/components/shared/ItemStacks";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {toolRequirementText} from "~/lib/recipe-sources";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function TerraformingDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.TerraformRecipeDesc);
    const index = BitCraftTables.TerraformRecipeDesc.indexedBy("difference", true);
    const toolIndex = BitCraftTables.ToolTypeDesc.indexedBy("id");

    const recipe = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    // Compute the tool string directly rather than via toolReqPair(): that helper eagerly builds
    // an <IconSpan> element (its label half, unused here), and creating JSX inside this memo — off
    // the render path — drifts Solid's SSR hydration ids and crashes the bot path.
    const tool = createMemo(() => {
        const r = recipe();
        if (!r?.toolRequirement) return undefined;
        const req = r.toolRequirement;
        const tt = toolIndex()?.get(req.toolType);
        if (!tt) return undefined;
        return toolRequirementText(req.level, tt.name, req.power);
    })

    return (
        <DetailPageLayout
            title={"Elevation ±" + recipe()?.difference}
            breadcrumbHref="/database/terraforming"
            loading={isLoading() && !recipe()}
            icon={<FontIcon codepoint="0034" class="size-8"/>}
            name={t`Terraform Elevation Difference ${recipe()?.difference ?? ""}`}
            description={"Elevation difference calculated from original world gen elevation."}
            metaKind="terraforming"
            metaImage={ogImageForCodepoint("0034")}
            details={[
                {label: msg`Effort`, value: recipe()?.actionsCount},
                {label: msg`Stamina`, value: recipe()?.staminaPerAction},
                {label: msg`Time`, value: recipe()?.timePerAction},
                {label: msg`Tool`, value: tool()},
            ]}
            rawData={recipe()}
            spacetimeTable={BitCraftTables.TerraformRecipeDesc.spacetimeName}
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
