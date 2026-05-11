import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {splitCamelCase} from "~/lib/utils";

export default function SkillDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SkillDesc);
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");

    const skill = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return skillIndex()?.get(id);
    });

    return (
        <DetailPageLayout
            title={skill()?.name ?? `Skill #${params.id}`}
            loading={isLoading() && !skill()}
            name={skill()?.name ?? `Skill #${params.id}`}
            description={skill()?.description}
            tag={skill() ? splitCamelCase(skill()!.skillCategory?.tag ?? "") : undefined}
            details={[
                {label: "Title", value: skill()?.title},
                {label: "Max Level", value: skill()?.maxLevel},
            ]}
            rawData={skill()}
            spacetimeTable={BitCraftTables.SkillDesc.st_name}
            objectId={skill()?.id}
            chatLink={`(prof=${skill()?.id})`}
            tabs={[]}
        />
    );
}
