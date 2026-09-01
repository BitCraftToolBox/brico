import {CompletionCondition, ItemStack} from "@brico/bitcraft-bindings/types";
import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import {TbOutlineExternalLink as IconExternal} from "solid-icons/tb";
import {createMemo, For, Show} from "solid-js";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {QuestGraph} from "~/components/shared/QuestGraph";
import {BitCraftTables, useTablesLoading} from "~/lib/bitcraft-data";
import {ItemStackLink, pageIcon} from "~/lib/game-links";
import {useLabel} from "~/lib/labels";
import {ogImageForPage} from "~/lib/og-meta";
import {getQuestSubtreeIds, questChainCompleter} from "~/lib/quests";
import {useSettings} from "~/lib/settings";
import {ReqOrRewardLink, reqOrRewardTagLabel} from "~/lib/table-defs/quests-table";

type StageConditionRow = { condition: CompletionCondition; stageName: string; chainId: number };

export default function QuestChainDetail() {
    const params = useParams();
    const label = useLabel();
    const isLoading = useTablesLoading(BitCraftTables.QuestChainDesc);
    const questIndex = BitCraftTables.QuestChainDesc.indexedBy("id");
    const {completedQuests, setCompletedQuests} = useSettings();

    const quest = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return questIndex().get(id);
    });

    const stages = createMemo(() => {
        const q = quest();
        if (!q) return [];
        const all = BitCraftTables.QuestStageDesc.indexedByMulti("chainDescId");
        return all().get(q.id)?.sort((a, b) => q.stages.indexOf(a.id) - q.stages.indexOf(b.id)) ?? [];
    });

    const details = createMemo((): DetailGroup[] => {
        const q = quest();
        if (!q) return [];
        return [{
            properties: [
                {label: msg`Is Hint`, value: q.isHint},
                {label: msg`Unstartable`, value: q.unstartable},
                {label: msg`Is Secret`, value: q.isSecret},
                {label: msg`Stages`, value: q.stages?.length ?? 0},
            ],
        }];
    });

    const allRequirements = createMemo(() => {
        const q = quest();
        if (!q) return [];
        return (q.requirements ?? []).filter(r => r.tag !== "PaddingNone");
    });

    const allRewards = createMemo(() => {
        const q = quest();
        if (!q) return [];
        return [...(q.rewards ?? []), ...(q.implicitRewards ?? [])].filter(r => r.tag !== "PaddingNone");
    });

    const stageConditions = createMemo((): StageConditionRow[] => {
        const q = quest();
        if (!q) return [];
        const rows: StageConditionRow[] = [];
        for (const stage of stages()) {
            for (const c of stage.completionConditions ?? []) {
                if (c.tag === "PaddingNone") continue;
                rows.push({condition: c, stageName: stage.name, chainId: q.id});
            }
        }
        return rows;
    });

    const stageRewards = createMemo(() => {
        const q = quest();
        if (!q) return [];
        const all = BitCraftTables.StageRewardsDesc.indexedByMulti("chainDescId");
        const rewards = all().get(q.id);
        if (!rewards?.length) return [];
        return rewards.flatMap(r => r.rewards);
    });

    const isComplete = () => completedQuests().has(quest()?.id ?? 0);
    const {toggleComplete} = questChainCompleter(completedQuests, setCompletedQuests);

    // Upstream + downstream tree for this chain, used to scope the embedded Quest Graph tab
    const questSubtreeIds = createMemo(() => {
        const q = quest();
        if (!q || q.isHint || q.unstartable) return undefined;
        return getQuestSubtreeIds(q.id, questIndex());
    });

    const graphControls = () => (
        <Show when={quest() && !quest()!.unstartable && !quest()!.isHint}>
            <label class="flex items-center gap-2 text-sm cursor-pointer select-none w-fit">
                <input
                    type="checkbox"
                    checked={isComplete()}
                    onChange={() => toggleComplete(quest()!.id)}
                    class="accent-green-600"
                />
                <span class={isComplete() ? "text-green-600 dark:text-green-400" : ""}>
                    {isComplete() ? "Completed" : "Mark as complete"}
                </span>
            </label>
        </Show>
    );

    return (
        <DetailPageLayout
            title={quest()?.name ?? `Quest #${params.id}`}
            breadcrumbHref="/database/quest-chain"
            loading={isLoading() && !quest()}
            name={quest()?.name ?? `Quest #${params.id}`}
            icon={pageIcon("Quest Chains", "size-16")}
            metaKind="quest chain"
            metaImage={ogImageForPage("Quest Chains")}
            details={details()}
            defaultTab={"summary"}
            summaryContent={stages().length || (quest() && !quest()!.unstartable && !quest()!.isHint) ? () => (
                <div class="flex flex-col gap-3 px-1 py-2">
                    {graphControls()}
                    <Show when={stages().length}>
                        <div class="flex flex-col gap-1">
                            <h3 class="text-sm font-semibold text-muted-foreground mb-1">Quest Stages</h3>
                            <ol class="list-decimal list-inside text-sm space-y-1">
                                <For each={stages()}>
                                    {(stage) => <li>{stage.name}</li>}
                                </For>
                            </ol>
                        </div>
                    </Show>
                </div>
            ) : undefined}
            rawData={quest()}
            spacetimeTable={BitCraftTables.QuestChainDesc.spacetimeName}
            objectId={quest()?.id}
            tabs={[
                {
                    id: "requirements",
                    label: msg`Requirements`,
                    count: allRequirements().length,
                    showWhenEmpty: true,
                    content: () => (
                        <RelTable data={allRequirements()} columns={[
                            {header: msg`Type`, cell: r => <span class="text-muted-foreground text-sm">{label(reqOrRewardTagLabel(r.tag))}</span>},
                            {header: msg`Requirement`, cell: r => <ReqOrRewardLink qr={r}/>},
                        ]}/>
                    ),
                },
                {
                    id: "rewards",
                    label: msg`Rewards`,
                    count: allRewards().length,
                    showWhenEmpty: true,
                    content: () => (
                        <RelTable data={allRewards()} columns={[
                            {header: msg`Type`, cell: r => <span class="text-muted-foreground text-sm">{label(reqOrRewardTagLabel(r.tag))}</span>},
                            {header: msg`Reward`, cell: r => <ReqOrRewardLink qr={r}/>},
                        ]}/>
                    ),
                },
                {
                    id: "stage-conditions",
                    label: msg`Stage Requirements`,
                    count: stageConditions().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<StageConditionRow> data={stageConditions()} columns={[
                            {header: msg`Stage`, cell: row => <span class="text-sm">{row.stageName}</span>},
                            {header: msg`Type`, cell: row => <span class="text-muted-foreground text-sm">{label(reqOrRewardTagLabel(row.condition.tag))}</span>},
                            {
                                header: msg`Requirement`, cell: row => {
                                    return (
                                        <div class="flex gap-1">
                                            <ReqOrRewardLink qr={row.condition}/>
                                            <Show when={row.condition.tag === "ItemStack" && row.condition.value.isConsumed}>
                                                <span class="text-muted-foreground text-sm"><Trans>(consumed)</Trans></span>
                                            </Show>
                                        </div>
                                    )
                                }
                            },
                        ]}/>
                    ),
                },
                {
                    id: "stage-rewards",
                    label: msg`Stage Rewards`,
                    count: stageRewards().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<ItemStack> data={stageRewards()} columns={[
                            {header: msg`Item`, cell: row => <ItemStackLink stack={row}/>},
                        ]}/>
                    )
                },
                ...(questSubtreeIds() ? [{
                    id: "quest-graph",
                    label: msg`Quest Graph`,
                    content: () => (
                        <div class="flex flex-col items-center">
                            <div class="h-[600px] flex flex-col w-full">
                                <QuestGraph
                                    completedQuests={completedQuests}
                                    setCompletedQuests={setCompletedQuests}
                                    chainIds={questSubtreeIds()}
                                    focusChainId={quest()!.id}
                                />
                            </div>
                            <A href={`/tools/quest-graph?chain=${quest()!.id}`} class="pt-2 text-muted-foreground underline hover:text-foreground">
                                View in full quest graph <IconExternal class="inline"/>
                            </A>
                        </div>
                    ),
                }] : [])
            ]}
        />
    );
}
