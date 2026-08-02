import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemIcon} from "~/components/shared/GameIcon";
import {breadcrumb, ItemLink, SkillLinkById} from "~/lib/game-links";
import {ogImageForAsset} from "~/lib/og-meta";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function ToolDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.ToolDesc);
    const toolIndex = BitCraftTables.ToolDesc.indexedBy("itemId");
    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const toolTypeIndex = BitCraftTables.ToolTypeDesc.indexedBy("id");

    const tool = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return toolIndex().get(id);
    });

    const item = createMemo(() => tool() ? itemIndex().get(tool()!.itemId) : undefined);
    const toolType = createMemo(() => tool() ? toolTypeIndex().get(tool()!.toolType) : undefined);

    return (
        <DetailPageLayout
            title={item()?.name ?? `Tool #${params.id}`}
            breadcrumb={breadcrumb("/database/tool")}
            loading={isLoading() && !tool()}
            icon={<Show when={item()}>{(i) =>
                <ItemIcon item={i()} small={false} noInteract/>
            }</Show>}
            name={item()?.name ?? `Tool #${params.id}`}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            metaKind="tool"
            metaImage={ogImageForAsset(item()?.iconAssetName)}
            details={[
                {label: msg`Tool Type`, value: toolType()?.name},
                {label: msg`Power`, value: tool()?.power},
                {label: msg`Level`, value: tool()?.level},
                {label: msg`Skill`, value: toolType()?.skillId ? () => <SkillLinkById skillId={toolType()!.skillId}/> : undefined},
            ]}
            rawData={tool()}
            spacetimeTable={BitCraftTables.ToolDesc.spacetimeName}
            objectId={tool()?.itemId}
            chatLink={`(item=${item()?.id})`}
            tabs={[
                {
                    id: "item", label: msg`Item`, count: item() ? 1 : 0,
                    content: () => (
                        <Show when={item()}>
                            {d => <div class="p-1">
                                <ItemLink id={d().id} name={d().name}/>
                            </div>}
                        </Show>
                    ),
                },
            ]}
        />
    );
}
