/**
 * Quest Graph Tool — Visualizes all quest chains organized by prerequisite depth.
 *
 * Route: /tools/quest-graph
 * URL params: ?chain=<id> to zoom to a specific quest chain on load.
 *
 * Displays all non-hint, non-unstartable quests as a DAG with prerequisite edges.
 * Completed quests are persisted in AppSettings via localStorage.
 */

import {useSearchParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import MainLayout from "~/components/MainLayout";
import {QuestGraph} from "~/components/shared/QuestGraph";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";

export default function QuestGraphTool() {
    const [searchParams, setSearchParams] = useSearchParams();
    const {completedQuests, setCompletedQuests} = useSettings();

    const isLoading = useTablesLoading(
        BitCraftTables.QuestChainDesc,
        BitCraftTables.QuestStageDesc,
        BitCraftTables.KnowledgeScrollDesc,
        BitCraftTables.CraftingRecipeDesc,
        BitCraftTables.ItemDesc,
        BitCraftTables.CargoDesc,
        BitCraftTables.SkillDesc,
        BitCraftTables.SecondaryKnowledgeDesc,
        BitCraftTables.AchievementDesc,
        BitCraftTables.CollectibleDesc,
    );

    const focusChainId = createMemo(() => {
        const c = searchParams.chain;
        if (!c) return undefined;
        const str = Array.isArray(c) ? c[0] : c;
        const id = parseInt(str, 10);
        return isNaN(id) ? undefined : id;
    });

    return (
        <MainLayout title="Quest Graph">
            <Show when={!isLoading()} fallback={
                <div class="flex items-center justify-center py-20">
                    <Spinner type={SpinnerType.ballTriangle} class="mx-auto"/>
                </div>
            }>
                <div class="flex flex-col gap-4 px-4 pb-6 h-full">
                    <div class="flex justify-center">
                        <h1 class="text-xl font-bold">Quest Chains</h1>
                    </div>
                    <QuestGraph
                        completedQuests={completedQuests}
                        setCompletedQuests={setCompletedQuests}
                        focusChainId={focusChainId()}
                        setChainId={(id) => setSearchParams({chain: String(id)})}
                    />
                </div>
            </Show>
        </MainLayout>
    );
}
