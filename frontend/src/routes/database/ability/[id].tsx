import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {FontIcon} from "~/components/icons/font-icons";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {BuffTable} from "~/components/shared/RelTablePresets";
import {ogImageForCodepoint} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat, readableSeconds} from "~/lib/utils";

export default function AbilityDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.AbilityCustomDesc);
    const index = BitCraftTables.AbilityCustomDesc.indexedBy("id");
    const buffIndex = BitCraftTables.BuffDesc.indexedBy("id");

    const ability = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index().get(id);
    });

    const buffs = createMemo(() => {
        const a = ability();
        if (!a?.buffs?.length) return [];
        const idx = buffIndex();
        return a.buffs.map(be => {
            const buff = idx.get(be.buffId);
            return {
                ...be,
                duration: be.duration ?? buff?.duration,
                label: buff?.description ?? `Buff #${be.buffId}`,
            };
        });
    });

    return (
        <DetailPageLayout
            title={ability()?.abilityName ?? `Ability #${params.id}`}
            breadcrumbHref="/database/ability"
            breadcrumbTitle={msg`Ability`}
            loading={isLoading() && !ability()}
            name={ability()?.abilityName ?? "Ability not found"}
            icon={<Show when={ability()?.iconPath}>{c => <FontIcon codepoint={c()} class="size-16"/>}</Show>}
            metaKind="ability"
            metaImage={ogImageForCodepoint(ability()?.iconPath)}
            chatLink={`(ability=${ability()?.id})`}
            details={[
                {
                    properties: [
                        {label: msg`Stamina Cost`, value: ability()?.staminaCost},
                        {label: msg`Cooldown`, value: readableSeconds(fixFloat(ability()?.cooldown))},
                    ],
                },
            ]}
            rawData={ability()}
            spacetimeTable={BitCraftTables.AbilityCustomDesc.spacetimeName}
            objectId={ability()?.id}
            tabs={[
                {id: "buffs", label: msg`Buffs`, count: buffs().length, content: () => <BuffTable data={buffs()}/>},
            ]}
        />
    );
}
