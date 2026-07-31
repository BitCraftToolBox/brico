import {msg} from "@lingui/core/macro";
import {useParams} from "@solidjs/router";
import {createMemo, For, Show} from "solid-js";
import {CombatActionDesc} from "~/bindings/src/combat_action_desc_type";
import {ContributionLootDesc} from "~/bindings/src/contribution_loot_desc_type";
import {EnemyScalingDesc} from "~/bindings/src/enemy_scaling_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {DetailGroup, DetailPageLayout, RelTable} from "~/components/shared/DetailPageLayout";
import {EnemyIcon} from "~/components/shared/GameIcon";
import {ItemListDisplay, QuestDropDisplay} from "~/components/shared/ItemStacks";
import {EnemyDropPanel} from "~/components/shared/RecipeDisplay";
import {CombatActionTable} from "~/components/shared/RelTablePresets";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {checkStepHeight} from "~/lib/bitcraft-utils";
import {breadcrumb, ItemListLink, SkillLinkById} from "~/lib/game-links";
import {ogImageForAsset} from "~/lib/og-meta";
import {itemListLootWeightedComponent} from "~/lib/recipe-sources";
import {contributionLootFromEnemy, questDropsForEnemy, questDropsForItemList, scalingDescsFromEnemy} from "~/lib/relations";
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
        return index().get(id);
    });

    const pathfinding = createMemo(() => creature() ? pathfindingIndex().get(creature()!.pathfindingId) : undefined);

    const combatActions = createMemo(() => {
        const c = creature();
        if (!c?.combatActionsIds?.length) return [];
        const idx = combatActionIndex();
        return c.combatActionsIds.map(id => idx.get(id)).filter((v): v is CombatActionDesc => !!v);
    });

    const extractedItems = createMemo(() => creature()?.extractedItemStacks ?? []);
    const questDrops = createMemo(() => creature() ? questDropsForEnemy(creature()!.enemyType) : []);
    const contributionLists = createMemo(() => creature() ? contributionLootFromEnemy(creature()!) : []);

    const scaling = createMemo(() => creature() ? scalingDescsFromEnemy(creature()!) : []);

    const {labels: pathfindingLabels} = checkStepHeight(pathfinding);

    const experience = createMemo(() => {
        const c = creature();
        if (!c?.experiencePerDamageDealt?.length) return undefined;
        const entries = c.experiencePerDamageDealt.filter(exp => exp.skillId);
        if (!entries.length) return undefined;
        return () => entries.map(exp => {
            return <><SkillLinkById skillId={exp.skillId}/>: <Tooltip openOnTouchStart>
                    <TooltipTrigger class={"decoration-dotted underline"}>{fixFloat(exp.quantity)}</TooltipTrigger>
                    <TooltipContent>
                        Experience per Damage Dealt<br/>
                        {c.maxHealth} HP * {fixFloat(exp.quantity)} = {c.maxHealth * fixFloat(exp.quantity)} XP<br/>
                        <span class="text-muted-foreground">Note: overkill damage also grants XP. This is the minimum.</span>
                    </TooltipContent>
                </Tooltip>
            </>;
        }).map((e, i) => <>{i > 0 && <><br/></>}{e}</>);
    });

    const detailGroups = createMemo((): DetailGroup[] => {
        const c = creature();
        if (!c) return [];
        return [
            //{ properties: [{ label: "Huntable", value: c.huntable }]}, // for now, redundant with the "Huntable Animal" tag
            {
                heading: msg`Combat`,
                properties: [
                    {label: msg`Max Health`, value: c.maxHealth},
                    {label: msg`Health Regen`, value: fixFloat(c.healthRegenQuantity)},
                    {label: msg`Exp`, value: experience()},
                    {label: msg`Armor`, value: c.armor},
                    {label: msg`Accuracy`, value: c.accuracy},
                    {label: msg`Evasion`, value: c.evasion},
                    {label: msg`Strength`, value: c.strength},
                    {label: msg`Min Damage`, value: c.minDamage},
                    {label: msg`Max Damage`, value: c.maxDamage},
                    {label: msg`Cooldown Multiplier`, value: fixFloat(c.cooldownMultiplier)},
                    {label: msg`Attack Level`, value: c.attackLevel},
                    {label: msg`Defense Level`, value: c.defenseLevel},
                    {label: msg`Radius`, value: c.radius},
                ],
            },
            {
                heading: msg`Movement`,
                properties: [
                    {label: msg`Min Speed`, value: c.minSpeed},
                    {label: msg`Max Speed`, value: c.maxSpeed},
                    ...pathfindingLabels(),
                    {label: msg`Evade Range`, value: c.evadeRange},
                ],
            },
            {
                heading: msg`Awareness & Aggro`,
                properties: [
                    {label: msg`Day Detect Range`, value: c.daytimeDetectRange},
                    {label: msg`Day Aggro Range`, value: c.daytimeAggroRange},
                    {label: msg`Day Deaggro Range`, value: c.daytimeDeaggroRange},
                    {label: msg`Night Detect Range`, value: c.nighttimeDetectRange},
                    {label: msg`Night Aggro Range`, value: c.nighttimeAggroRange},
                    {label: msg`Night Deaggro Range`, value: c.nighttimeDeaggroRange},
                    {label: msg`Deaggro Health`, value: `${fixFloat(c.deaggroHealthThreshold * 100)}%`},
                    {label: msg`Awareness Threshold`, value: `${fixFloat(c.awarenessDestinationThreshold)}`},
                    {label: msg`Awareness Tick`, value: `${c.minAwarenessTickSec}–${c.maxAwarenessTickSec}s`},
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
            metaKind="creature"
            metaImage={ogImageForAsset(creature()?.iconAddress)}
            details={detailGroups()}
            rawData={creature()}
            spacetimeTable={BitCraftTables.EnemyDesc.spacetimeName}
            objectId={creature()?.enemyType}
            chatLink={`(mob=${creature()?.enemyType})`}
            tabs={[
                {
                    id: "combat",
                    label: msg`Combat Actions`,
                    count: combatActions().length,
                    content: () => <CombatActionTable data={combatActions()}/>,
                },
                {
                    id: "drops",
                    label: msg`Drops`,
                    count: extractedItems().length + questDrops().length,
                    showWhenEmpty: false,
                    content: () => <Show when={creature()}>
                        {(c) => <EnemyDropPanel enemy={c()}/>}
                    </Show>,
                },
                {
                    id: "loot",
                    label: msg`Contribution Loot`,
                    count: contributionLists().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<LootRow>
                            data={contributionLists()}
                            columns={[
                                {
                                    header: msg`Item List`,
                                    cell: ([, list]) => (
                                        <ItemListLink
                                            id={list.id}
                                            name={list.name.replace(/[A-Z]/g, letter => `\u200b${letter}`)}
                                            class="text-wrap"
                                        />
                                    ),
                                },
                                {
                                    header: msg`Min Contribution`,
                                    cell: ([loot]) => <span>{loot.minimumContribution}</span>,
                                },
                                {
                                    header: msg`Weighted`,
                                    cell: ([loot]) => itemListLootWeightedComponent(loot.weighted),
                                },
                                {
                                    header: msg`Output`,
                                    cell: ([loot, list]) => {
                                        const questDrops = questDropsForItemList(list.id);
                                        const listComp = <ItemListDisplay itemList={list} chances={loot.weighted ? 1000 : 1} probability={1}/>;
                                        return (
                                            <div class="flex flex-row flex-wrap gap-1">
                                                <Show when={questDrops.length} fallback={listComp}>
                                                    <div>{listComp}</div>
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
                {
                    id: "scaling",
                    label: msg`Stat Scaling`,
                    count: scaling().length,
                    showWhenEmpty: false,
                    content: () => (
                        <RelTable<EnemyScalingDesc>
                            data={scaling().sort((a, b) => a.requiredPlayersCount - b.requiredPlayersCount)}
                            columns={[
                                {
                                    header: msg`Required Players`,
                                    cell: (scaling) => <span>{scaling.requiredPlayersCount}</span>,
                                },
                                {
                                    header: msg`Stat Bonuses`,
                                    cell: (scaling) => {
                                        const pairs = [
                                            ["Scaled Armor", scaling.scaledArmorBonus],
                                            ["Strength", scaling.strengthBonus],
                                            ["Accuracy", scaling.accuracyBonus],
                                            ["Evasion", scaling.evasionBonus],
                                            ["Min. Damage", scaling.minDamageBonus],
                                            ["Max. Damage", scaling.maxDamageBonus],
                                        ].filter((p) => !!p[1]);
                                        return (
                                            <div class="flex flex-row flex-wrap gap-1">
                                                <For each={pairs}>
                                                    {p => (
                                                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">
                                                            <span class="font-medium">{p[0]}</span>
                                                            <span class="opacity-70">{p[1]}</span>
                                                        </span>
                                                    )}
                                                </For>
                                            </div>
                                        )
                                    },
                                },
                            ]}
                        />
                    )
                }
            ]}
        />
    );
}
