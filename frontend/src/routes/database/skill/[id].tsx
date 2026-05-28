import {useParams} from "@solidjs/router";
import {createMemo} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {breadcrumb} from "~/lib/game-links";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function SkillDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SkillDesc);
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");

    const skill = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return skillIndex()?.get(id);
    });
    const skillTag = createMemo(() => {
        const s = skill();
        if (!s) return "Unknown";
        if (s.skillCategory.tag == "None") return "Skill";
        return s.skillCategory.tag;
    });

    return (
        <DetailPageLayout
            title={skill()?.name ?? `Skill #${params.id}`}
            breadcrumb={breadcrumb("/database/skill", skillTag())}
            loading={isLoading() && !skill()}
            name={skill()?.name ?? `Skill #${params.id}`}
            description={skill()?.description}
            tag={skillTag()}
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
