import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {GameIcon} from "~/components/shared/GameIcon";
import {breadcrumb, SkillLinkById} from "~/lib/game-links";
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
        return toolIndex()?.get(id);
    });

    const item = createMemo(() => tool() ? itemIndex()?.get(tool()!.itemId) : undefined);
    const toolType = createMemo(() => tool() ? toolTypeIndex()?.get(tool()!.toolType) : undefined);

    return (
        <DetailPageLayout
            title={item()?.name ?? `Tool #${params.id}`}
            breadcrumb={breadcrumb("/database/tool")}
            loading={isLoading() && !tool()}
            icon={<Show when={item()}>{(i) =>
                <GameIcon name={i().name} iconAsset={i().iconAssetName} shape="tall"
                          small={false} tier={i().tier} rarity={i().rarity} noInteract/>
            }</Show>}
            name={item()?.name ?? `Tool #${params.id}`}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            details={[
                {label: "Tool Type", value: toolType()?.name},
                {label: "Power", value: tool()?.power},
                {label: "Level", value: tool()?.level},
                {label: "Skill", value: toolType()?.skillId ? <SkillLinkById skillId={toolType()!.skillId}/> : undefined},
            ]}
            rawData={tool()}
            spacetimeTable={BitCraftTables.ToolDesc.st_name}
            objectId={tool()?.itemId}
            chatLink={`(item=${item()?.id})`}
            tabs={[
                {
                    id: "item", label: "Item", count: item() ? 1 : 0,
                    content: () => <Show when={item()}>
                        <RelTable data={[item()!]} columns={[
                            {header: "Item", cell: row => <A href={`/database/item/${row.id}`}>{row.name}</A>},
                        ]}/>
                    </Show>,
                },
            ]}
        />
    );
}
