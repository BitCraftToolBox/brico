import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {ItemIcon} from "~/components/shared/GameIcon";
import {questsRequiring, questsRewarding, questsWithStageCondition} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {questRequirementsTab, questRewardsTab} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat, splitCamelCase} from "~/lib/utils";

export default function KnowledgeDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.SecondaryKnowledgeDesc);
    const knowledgeIndex = BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id");

    const knowledge = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return knowledgeIndex()?.get(id);
    });

    const scroll = createMemo(() => {
        const k = knowledge();
        if (!k) return undefined;
        return BitCraftTables.KnowledgeScrollDesc.indexedBy("secondaryKnowledgeId")()?.get(k.id);
    });

    const statMod = createMemo(() => {
        const k = knowledge();
        if (!k) return undefined;
        return BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")()?.get(k.id);
    });

    const item = createMemo(() => {
        const s = scroll();
        if (!s) return undefined;
        return BitCraftTables.ItemDesc.indexedBy("id")?.()?.get(s.itemId);
    });

    const questRequires = createMemo(() => {
        const k = knowledge();
        if (!k) return [];
        const byReq = questsRequiring("SecondaryKnowledge", k.id);
        const byCondition = questsWithStageCondition("SecondaryKnowledge", k.id);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewards = createMemo(() => {
        const k = knowledge();
        if (!k) return [];
        return questsRewarding("SecondaryKnowledge", k.id);
    });

    const details = createMemo((): DetailGroup[] => {
        const groups: DetailGroup[] = [];
        const s = scroll();
        if (s) {
            groups.push({
                properties: [
                    {label: "Title", value: s.title},
                    {label: "Tag", value: s.tag},
                    {label: "Known By Default", value: s.knownByDefault},
                    {label: "Auto Collect", value: s.autoCollect},
                ],
            });
        }
        const mod = statMod();
        if (mod?.stats?.length) {
            groups.push({
                heading: "Stats",
                properties: mod.stats.map(s => ({
                    label: splitCamelCase(s.id?.tag ?? ""),
                    value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                })),
            });
        }
        return groups;
    });

    return (
        <DetailPageLayout
            title={knowledge()?.name ?? `Knowledge #${params.id}`}
            loading={isLoading() && !knowledge()}
            icon={<Show when={item()}>{(i) =>
                <ItemIcon item={i()} small={false} noInteract/>
            }</Show>}
            name={knowledge()?.name ?? `Knowledge #${params.id}`}
            description={scroll()?.content}
            tag={scroll()?.tag}
            details={details()}
            rawData={knowledge()}
            spacetimeTable={BitCraftTables.SecondaryKnowledgeDesc.st_name}
            objectId={knowledge()?.id}
            chatLink={scroll() ? `(know=${scroll()!.itemId})` : undefined}
            tabs={[
                {
                    id: "item", label: "Item", count: item() ? 1 : 0,
                    content: () => <Show when={item()}>
                        <RelTable data={[item()!]} columns={[
                            {header: "Item", cell: row => <A href={`/database/item/${row.id}`}>{row.name}</A>},
                        ]}/>
                    </Show>,
                },
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewards()),
            ]}
        />
    );
}
