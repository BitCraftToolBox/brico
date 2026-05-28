import {useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {ContributionLootDesc} from "~/bindings/src/contribution_loot_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {EnemyIcon} from "~/components/shared/GameIcon";
import {ItemListDisplay, QuestDropDisplay} from "~/components/shared/ItemStacks";
import {EnemyDropPanel} from "~/components/shared/RecipeDisplay";
import {CombatActionTable} from "~/components/shared/RelTablePresets";
import {checkStepHeight} from "~/lib/bitcraft-utils";
import {breadcrumb, ItemListLink, SkillLinkById} from "~/lib/game-links";
import {contributionLootFromEnemy, questDropsForEnemy, questDropsForItemList} from "~/lib/relations";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

type LootRow = [ContributionLootDesc, ItemListDesc];

export default function CreatureDetail() {
    const params = useParams();
    const isLoading = useTablesLoading(BitCraftTables.EnemyDesc);
    const index = BitCraftTables.EnemyDesc.indexedBy("enemyType");
    const pathfindingIndex = BitCraftTables.PathfindingDesc.indexedBy("id");
    const combatActionIndex = BitCraftTables.CombatActionDesc.indexedBy("id");

    const creature = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return index()?.get(id);
    });

    const pathfinding = createMemo(() => creature() ? pathfindingIndex()?.get(creature()!.pathfindingId) : undefined);

    const combatActions = createMemo(() => {
        const c = creature();
        if (!c?.combatActionsIds?.length) return [];
        const idx = combatActionIndex();
        if (!idx) return [];
        return c.combatActionsIds.map(id => idx.get(id)).filter((v): v is CombatActionDesc => !!v);
    });

    const extractedItems = createMemo(() => creature()?.extractedItemStacks ?? []);
    const questDrops = createMemo(() => creature() ? questDropsForEnemy(creature()!.enemyType) : []);
    const contributionLists = createMemo(() => creature() ? contributionLootFromEnemy(creature()!) : []);

    const {labels: pathfindingLabels} = checkStepHeight(pathfinding);

    const experience = createMemo(() => {
        const c = creature();
        if (!c?.experiencePerDamageDealt?.length) return undefined;
        return c.experiencePerDamageDealt.filter(exp => exp.skillId).map(exp => {
            return <><SkillLinkById skillId={exp.skillId}/>: <span title={"Experience per Damage Dealt"} class={"decoration-dotted underline"}>{fixFloat(exp.quantity)}</span></>;
        }).map((e, i) => <>{i > 0 && <><br/></>}{e}</>);
    });

    const detailGroups = createMemo((): DetailGroup[] => {
        const c = creature();
        if (!c) return [];
        return [
            //{ properties: [{ label: "Huntable", value: c.huntable }]}, // for now, redundant with the "Huntable Animal" tag
            {
                heading: "Combat",
                properties: [
                    {label: "Max Health", value: c.maxHealth},
                    {label: "Health Regen", value: fixFloat(c.healthRegenQuantity)},
                    {label: "Exp", value: experience()},
                    {label: "Armor", value: c.armor},
                    {label: "Accuracy", value: c.accuracy},
                    {label: "Evasion", value: c.evasion},
                    {label: "Strength", value: c.strength},
                    {label: "Min Damage", value: c.minDamage},
                    {label: "Max Damage", value: c.maxDamage},
                    {label: "Cooldown Multiplier", value: fixFloat(c.cooldownMultiplier)},
                    {label: "Attack Level", value: c.attackLevel},
                    {label: "Defense Level", value: c.defenseLevel},
                    {label: "Radius", value: c.radius},
                ],
            },
            {
                heading: "Movement",
                properties: [
                    {label: "Min Speed", value: c.minSpeed},
                    {label: "Max Speed", value: c.maxSpeed},
                    ...pathfindingLabels(),
                    {label: "Evade Range", value: c.evadeRange},
                ],
            },
            {
                heading: "Awareness & Aggro",
                properties: [
                    {label: "Day Detect Range", value: c.daytimeDetectRange},
                    {label: "Day Aggro Range", value: c.daytimeAggroRange},
                    {label: "Day Deaggro Range", value: c.daytimeDeaggroRange},
                    {label: "Night Detect Range", value: c.nighttimeDetectRange},
                    {label: "Night Aggro Range", value: c.nighttimeAggroRange},
                    {label: "Night Deaggro Range", value: c.nighttimeDeaggroRange},
                    {label: "Deaggro Health", value: `${fixFloat(c.deaggroHealthThreshold * 100)}%`},
                    {label: "Awareness Threshold", value: `${fixFloat(c.awarenessDestinationThreshold)}`},
                    {label: "Awareness Tick", value: `${c.minAwarenessTickSec}–${c.maxAwarenessTickSec}s`},
                ],
            },
        ];
    });

    return (
        <DetailPageLayout
            title={creature()?.name ?? `Creature #${params.id}`}
            breadcrumb={breadcrumb("/database/creature")}
            loading={isLoading() && !creature()}
            icon={<Show when={creature()}>{(c) =>
                <EnemyIcon enemy={c()} small={false} noInteract/>
            }</Show>}
            name={creature()?.name ?? "Creature not found"}
            tier={creature()?.tier}
            rarity={creature()?.rarity?.tag}
            description={creature()?.description}
            tag={creature()?.tag}
            details={detailGroups()}
            rawData={creature()}
            spacetimeTable={BitCraftTables.EnemyDesc.st_name}
            objectId={creature()?.enemyType}
            chatLink={`(mob=${creature()?.enemyType})`}
            tabs={[
                {
                    id: "combat",
                    label: "Combat Actions",
                    count: combatActions().length,
                    content: () => <CombatActionTable data={combatActions()}/>,
                },
                {
                    id: "drops",
                    label: "Drops",
                    count: extractedItems().length + questDrops().length,
                    showWhenEmpty: false,
                    content: () => <Show when={creature()}>
                        {(c) => <EnemyDropPanel enemy={c()}/>}
                    </Show>,
                },
                {
                    id: "loot",
                    label: "Contribution Loot",
                    count: contributionLists().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<LootRow>
                            data={contributionLists()}
                            columns={[
                                {
                                    header: "Item List",
                                    cell: ([, list]) => (
                                        <ItemListLink
                                            id={list.id}
                                            name={list.name.replace(/[A-Z]/g, letter => `\u200b${letter}`)}
                                            class="text-wrap"
                                        />
                                    ),
                                },
                                {
                                    header: "Min Contribution",
                                    cell: ([loot]) => <span>{loot.minimumContribution}</span>,
                                },
                                {
                                    header: "Weighted",
                                    cell: ([loot]) => <span>{loot.weighted ? "Yes" : "No"}</span>,
                                },
                                {
                                    header: "Output",
                                    cell: ([loot, list]) => {
                                        const questDrops = questDropsForItemList(list.id);
                                        const listComp = <ItemListDisplay itemList={list} chances={loot.weighted ? 1000 : 1} probability={1}/>;
                                        return (
                                            <div class="flex flex-row flex-wrap gap-1">
                                                <Show when={questDrops.length} fallback={listComp}>
                                                    <div class="mt-4">{listComp}</div>
                                                </Show>
                                                <For each={questDrops}>
                                                    {(drop) => <QuestDropDisplay questDrop={drop} chances={1}/>}
                                                </For>
                                            </div>
                                        )
                                    },
                                },
                            ]}
                        />
                    ),
                },
            ]}
        />
    );
}
