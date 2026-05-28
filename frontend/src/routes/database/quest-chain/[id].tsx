import {A, useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {CompletionCondition} from "~/bindings/src/completion_condition_type";
import {QuestStageDesc} from "~/bindings/src/quest_stage_desc_type";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {LinkedList, pageIcon, QuestChainLink} from "~/lib/game-links";
import {computeQuestTree, questChainCompleter, stagesByChain} from "~/lib/quests";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {ReqOrRewardLink, reqOrRewardTagLabel} from "~/lib/table-defs/quests-table";

type StageConditionRow = { condition: CompletionCondition; stageName: string; chainId: number };

export default function QuestChainDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.QuestChainDesc);
    const questIndex = BitCraftTables.QuestChainDesc.indexedBy("id");
    const {completedQuests, setCompletedQuests} = useSettings();

    const quest = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return questIndex()?.get(id);
    });

    const stages = createMemo(() => {
        const q = quest();
        if (!q) return [];
        const all = BitCraftTables.QuestStageDesc.get();
        if (!all) return [];
        return all.filter((s: QuestStageDesc) => s.chainDescId === q.id);
    });

    const details = createMemo((): DetailGroup[] => {
        const q = quest();
        if (!q) return [];
        return [{
            properties: [
                {label: "Is Hint", value: q.isHint},
                {label: "Unstartable", value: q.unstartable},
                {label: "Is Secret", value: q.isSecret},
                {label: "Stages", value: q.stages?.length ?? 0},
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

    const isComplete = () => completedQuests().has(quest()?.id ?? 0);
    const {toggleComplete} = questChainCompleter(completedQuests, setCompletedQuests);

    const stagesMap = stagesByChain();
    // Cumulative quest tree — only computed for real (non-hint, non-unstartable) quests
    const treeResult = createMemo(() => {
        const q = quest();
        if (!q || q.isHint || q.unstartable) return null;
        return computeQuestTree(q.id, completedQuests(), questIndex(), stagesMap());
    });

    const graphControls = () => (
        <Show when={quest() && !quest()!.unstartable && !quest()!.isHint}>
            <div class="flex flex-row items-center gap-4">
                <A href={`/tools/quest-graph?chain=${quest()!.id}`}
                   class="text-sm px-3 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors text-foreground inline-block w-fit">
                    View in Quest Graph
                </A>
                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
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
            </div>
        </Show>
    );

    return (
        <DetailPageLayout
            title={quest()?.name ?? `Quest #${params.id}`}
            loading={isLoading() && !quest()}
            name={quest()?.name ?? `Quest #${params.id}`}
            icon={pageIcon("Quest Chains", "size-16")}
            details={details()}
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
            infoTabs={treeResult()?.allTreeQuestIds.size ? [["Quest Tree", () => {
                const result = treeResult();
                if (!result) return <></>;
                const incomplete = [...result.involvedQuestIds];
                const complete = [...result.allTreeQuestIds].filter(id => !result.involvedQuestIds.has(id));
                return (
                    <div class="flex flex-col gap-4 px-1 py-2">
                        {graphControls()}
                        <Show when={complete.length > 0}>
                            <div>
                                <div class="text-xs font-medium text-muted-foreground mb-1">
                                    Completed ({complete.length}):
                                </div>
                                <LinkedList>
                                    {complete.map(id => <QuestChainLink id={id} name={questIndex()?.get(id)?.name}/>)}
                                </LinkedList>
                            </div>
                        </Show>
                        <Show when={incomplete.length > 0}>
                            <div>
                                <div class="text-xs font-medium text-muted-foreground mb-1">
                                    Incomplete ({incomplete.length}):
                                </div>
                                <LinkedList>
                                    {incomplete.map(id => <QuestChainLink id={id} name={questIndex()?.get(id)?.name}/>)}
                                </LinkedList>
                            </div>
                        </Show>
                        <Show when={result.requirements.length || result.rewards.length}>
                            <div class="text-sm text-muted-foreground">
                                Requirements/rewards shown for {result.involvedQuestIds.size} incomplete quest{result.involvedQuestIds.size !== 1 ? "s" : ""}.
                            </div>
                        </Show>
                        <Show when={result.requirements.length}>
                            <div>
                                <div class="text-xs font-medium text-muted-foreground mb-1">Cumulative Requirements:</div>
                                <div class="flex flex-col gap-0.5 ml-2">
                                    <For each={result.requirements}>
                                        {(r) => <div class="text-sm"><ReqOrRewardLink qr={r}/></div>}
                                    </For>
                                </div>
                            </div>
                        </Show>
                        <Show when={result.rewards.length}>
                            <div>
                                <div class="text-xs font-medium text-muted-foreground mb-1">Cumulative Rewards:</div>
                                <div class="flex flex-col gap-0.5 ml-2">
                                    <For each={result.rewards}>
                                        {(r) => <div class="text-sm"><ReqOrRewardLink qr={r}/></div>}
                                    </For>
                                </div>
                            </div>
                        </Show>
                    </div>
                );
            }]] : undefined}
            rawData={quest()}
            spacetimeTable={BitCraftTables.QuestChainDesc.st_name}
            objectId={quest()?.id}
            tabs={[
                {
                    id: "requirements",
                    label: "Requirements",
                    count: allRequirements().length,
                    showWhenEmpty: true,
                    content: () => (
                        <RelTable data={allRequirements()} columns={[
                            {header: "Type", cell: r => <span class="text-muted-foreground text-sm">{reqOrRewardTagLabel(r.tag)}</span>},
                            {header: "Requirement", cell: r => <ReqOrRewardLink qr={r}/>},
                        ]}/>
                    ),
                },
                {
                    id: "rewards",
                    label: "Rewards",
                    count: allRewards().length,
                    showWhenEmpty: true,
                    content: () => (
                        <RelTable data={allRewards()} columns={[
                            {header: "Type", cell: r => <span class="text-muted-foreground text-sm">{reqOrRewardTagLabel(r.tag)}</span>},
                            {header: "Reward", cell: r => <ReqOrRewardLink qr={r}/>},
                        ]}/>
                    ),
                },
                {
                    id: "stage-conditions",
                    label: "Stage Requirements",
                    count: stageConditions().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<StageConditionRow> data={stageConditions()} columns={[
                            {header: "Stage", cell: row => <span class="text-sm">{row.stageName}</span>},
                            {header: "Type", cell: row => <span class="text-muted-foreground text-sm">{reqOrRewardTagLabel(row.condition.tag)}</span>},
                            {
                                header: "Requirement", cell: row => {
                                    return (
                                        <div class="flex gap-1">
                                            <ReqOrRewardLink qr={row.condition}/>
                                            <Show when={row.condition.tag === "ItemStack" && row.condition.value.isConsumed}>
                                                <span class="text-muted-foreground text-sm">(consumed)</span>
                                            </Show>
                                        </div>
                                    )
                                }
                            },
                        ]}/>
                    ),
                },
            ]}
        />
    );
}
