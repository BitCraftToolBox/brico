import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {breadcrumb} from "~/lib/game-links";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function SkillDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SkillDesc);
    const skillIndex = BitCraftTables.SkillDesc.indexedBy("id");

    const skill = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return skillIndex().get(id);
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
            icon={<Show when={skill()?.iconAssetName}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            description={skill()?.description}
            tag={skillTag()}
            metaKind="skill"
            metaImage={ogImageForCodepoint(skill()?.iconAssetName)}
            details={[
                {label: "Title", value: skill()?.title},
                {label: "Max Level", value: skill()?.maxLevel},
            ]}
            rawData={skill()}
            spacetimeTable={BitCraftTables.SkillDesc.spacetimeName}
            objectId={skill()?.id}
            chatLink={`(prof=${skill()?.id})`}
            tabs={[]}
        />
    );
}
