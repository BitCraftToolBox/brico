import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {ItemType} from "~/bindings/src/item_type_type";
import {lootTabWith} from "~/components/fun/BricoLootBox";
import {DetailGroup, DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemIcon} from "~/components/shared/GameIcon";
import {breadcrumb, IconLink, pageIcon, SkillLinkById} from "~/lib/game-links";
import {interactionsInvolvingItem, placementsConsumingItem} from "~/lib/placeables";
import {
    constructionRecipesConsuming,
    conversionRecipesConsuming,
    conversionRecipesProducing,
    craftingRecipesConsuming,
    craftingRecipesProducing,
    deconstructionRecipesProducing,
    enemiesDropping,
    extractionRecipesConsuming,
    extractionRecipesDropping,
    itemListsContaining,
    questDropSourcesFor,
    questsRequiringItem,
    questsRewardingItem,
    questsWithStageConditionItem,
    resourcesYielding,
    travelerTasksRequiring,
    travelerTasksRewarding,
    travelerTradesOffering,
    travelerTradesRequiring,
} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {buffsGroups} from "~/lib/table-utils/detail-group-builders";
import {
    collectiblesTab,
    constructionCombinedTab,
    conversionTab,
    craftedFromTab,
    craftsIntoTab,
    depletionTab,
    enemyDropsTab,
    extractionTab,
    itemListsTab,
    itemListTab,
    placeableInteractionsTab,
    placeablePlacementTab,
    questRequirementsTab,
    questRewardsTab,
    travelerTasksTab,
    travelerTradesTab,
} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat, splitCamelCase} from "~/lib/utils";

export function questDropAugmentedLists(itemId: () => number | undefined, itemType: string) {
    const questSources = createMemo(() => itemId() != null ? questDropSourcesFor(itemId()!, itemType) : {extractionRecipes: [], enemies: [], itemLists: []});
    const extractionDrops = createMemo(() => {
        const drops = itemId() != null ? extractionRecipesDropping(itemId()!, itemType) : [];
        const extra = questSources().extractionRecipes;
        if (!extra) return drops;
        const ids = new Set(drops.map(r => r.id));
        return [...drops, ...extra.filter(r => !ids.has(r.id))];
    });
    const enemyDrops = createMemo(() => {
        const base = itemId() != null ? enemiesDropping(itemId()!, itemType) : [];
        const extra = questSources().enemies;
        if (!extra) return base;
        const ids = new Set(base.map(e => e.enemyType));
        return [...base, ...extra.filter(e => !ids.has(e.enemyType))];
    });
    const inItemLists = createMemo(() => {
        const lists = itemId() != null ? itemListsContaining(itemId()!, itemType) : [];
        const extra = questSources().itemLists;
        if (!extra) return lists;
        const ids = new Set(lists.map(l => l.id));
        return [...lists, ...extra.filter(l => !ids.has(l.id))];
    });
    return {extractionDrops, enemyDrops, inItemLists};
}

export default function ItemDetail() {
    const params = useParams();
    const { easterEggs } = useSettings();

    const isLoading = useTablesLoading(BitCraftTables.ItemDesc);

    const itemIndex = BitCraftTables.ItemDesc.indexedBy("id");
    const toolIndex = BitCraftTables.ToolDesc.indexedBy("itemId");
    const equipIndex = BitCraftTables.EquipmentDesc.indexedBy("itemId");
    const foodIndex = BitCraftTables.FoodDesc.indexedBy("itemId");
    const weaponIndex = BitCraftTables.WeaponDesc.indexedBy("itemId");
    const toolTypeIndex = BitCraftTables.ToolTypeDesc.indexedBy("id");
    const weaponTypeIndex = BitCraftTables.WeaponTypeDesc.indexedBy("id");
    const knowledgeScrollIndex = BitCraftTables.KnowledgeScrollDesc.indexedBy("itemId");
    const collectibleIndex = BitCraftTables.CollectibleDesc.indexedByMulti("itemDeedId");

    const item = createMemo(() => {
        const id = parseInt(params.id as string ?? "", 10);
        if (isNaN(id)) return undefined;
        return itemIndex()?.get(id);
    });

    const toolData = createMemo(() => item() ? toolIndex()?.get(item()!.id) : undefined);
    const equipData = createMemo(() => item() ? equipIndex()?.get(item()!.id) : undefined);
    const foodData = createMemo(() => item() ? foodIndex()?.get(item()!.id) : undefined);
    const weaponData = createMemo(() => item() ? weaponIndex()?.get(item()!.id) : undefined);
    const scrollData = createMemo(() => item() ? knowledgeScrollIndex()?.get(item()!.id) : undefined);
    const collectibleData = createMemo(() => {
        const coll = collectibleIndex();
        const i = item();
        if (!i || !coll) return [];
        return coll.get(i.id) ?? [];
    });

    const knowledgeStatData = createMemo(() => {
        const scroll = scrollData();
        if (!scroll) return undefined;
        return BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")()?.get(scroll.secondaryKnowledgeId);
    });

    // Expanded food buff info (buff desc + stats)
    const foodBuffGroups = createMemo((): DetailGroup[] => {
        const food = foodData();
        if (!food?.buffs?.length) return [];
        const buffs = food.buffs;
        return buffsGroups(buffs);
    });

    // ─── Per-type recipe/relationship finders ───────────────────

    const itemType = ItemType.Item.tag;
    const itemId = () => item()?.id;

    const craftedFrom = createMemo(() => itemId() != null ? craftingRecipesProducing(itemId()!, itemType) : []);
    const craftsInto = createMemo(() => itemId() != null ? craftingRecipesConsuming(itemId()!, itemType) : []);
    const extractionUses = createMemo(() => itemId() != null ? extractionRecipesConsuming(itemId()!, itemType) : []);
    const constructsInto = createMemo(() => itemId() != null ? constructionRecipesConsuming(itemId()!, itemType) : []);
    const deconstructedFrom = createMemo(() => itemId() != null ? deconstructionRecipesProducing(itemId()!, itemType) : []);
    const conversionInputs = createMemo(() => itemId() != null ? conversionRecipesConsuming(itemId()!, itemType) : []);
    const conversionOutputs = createMemo(() => itemId() != null ? conversionRecipesProducing(itemId()!, itemType) : []);
    const taskRequires = createMemo(() => itemId() != null ? travelerTasksRequiring(itemId()!, itemType) : []);
    const taskRewards = createMemo(() => itemId() != null ? travelerTasksRewarding(itemId()!, itemType) : []);
    const tradeRequires = createMemo(() => itemId() != null ? travelerTradesRequiring(itemId()!, itemType) : []);
    const tradeOffers = createMemo(() => itemId() != null ? travelerTradesOffering(itemId()!, itemType) : []);
    const depletionSources = createMemo(() => itemId() != null ? resourcesYielding(itemId()!, itemType) : []);
    const isItemList = createMemo(() => item() ? item()?.itemListId ? BitCraftTables.ItemListDesc.indexedBy("id")().get(item()?.itemListId) : undefined : undefined);
    const {extractionDrops, enemyDrops, inItemLists} = questDropAugmentedLists(itemId, itemType);

    const questRequires = createMemo(() => {
        if (itemId() == null) return [];
        const byReq = questsRequiringItem(itemId()!, itemType);
        const byCondition = questsWithStageConditionItem(itemId()!, itemType);
        const ids = new Set(byReq.map(q => q.id));
        return [...byReq, ...byCondition.filter(q => !ids.has(q.id))];
    });
    const questRewards = createMemo(() => itemId() != null ? questsRewardingItem(itemId()!, itemType) : []);

    const placeablePlacements = createMemo(() => itemId() != null ? placementsConsumingItem(itemId()!, itemType) : []);
    const placeableInteractions = createMemo(() => itemId() != null ? interactionsInvolvingItem(itemId()!, itemType) : []);

    const detailGroups = createMemo((): DetailGroup[] => {
        const i = item();
        if (!i) return [];
        const groups: DetailGroup[] = [];

        // General
        groups.push({
            properties: [
                {label: "Volume", value: i.volume},
                {label: "Durability", value: i.durability > 0 ? i.durability : undefined},
                {label: "Compendium Entry", value: !i.compendiumEntry ? false : undefined},
            ],
        });

        // Tool
        const tool = toolData();
        if (tool) {
            const toolType = toolTypeIndex()?.get(tool.toolType);
            groups.push({
                heading: <IconLink href={`/database/tool/${i.id}`} icon={pageIcon("Tools")}>Tool</IconLink>,
                properties: [
                    {label: "Type", value: toolType?.name ?? `#${tool.toolType}`},
                    {label: "Power", value: tool.power},
                    {label: "Level", value: tool.level},
                    {label: "Skill", value: toolType?.skillId ? <SkillLinkById skillId={toolType.skillId}/> : undefined},
                ],
            });
        }

        // Equipment
        const equip = equipData();
        if (equip) {
            const eqProps: DetailGroup["properties"] = [
                {label: "Slots", value: equip.slots?.map((s: any) => splitCamelCase(s.tag)).join(", ")},
            ];
            if (equip.levelRequirement) {
                eqProps.push({label: "Required Skill", value: <SkillLinkById skillId={equip.levelRequirement.skillId}/>});
                eqProps.push({label: "Required Level", value: equip.levelRequirement.level});
            }
            const eqGroup: DetailGroup = {heading: <IconLink href={`/database/equipment/${i.id}`} icon={pageIcon("Equipment")}>Equipment</IconLink>, properties: eqProps};
            groups.push(eqGroup);
            if (equip.stats?.length) {
                groups.push({
                    heading: <IconLink href={`/database/equipment/${i.id}`} icon={pageIcon("Equipment")}>Equipment Stats</IconLink>,
                    properties: equip.stats.map((stat: any) => ({
                        label: splitCamelCase(stat.id?.tag ?? ""),
                        value: `${fixFloat(stat.value * (stat.isPct ? 100 : 1))}${stat.isPct ? "%" : ""}`,
                    })),
                });
            }
        }

        // Weapon
        const weapon = weaponData();
        if (weapon) {
            const wt = weaponTypeIndex()?.get(weapon.weaponType);
            groups.push({
                heading: <IconLink href={`/database/weapon/${i.id}`} icon={pageIcon("Weapons")}>Weapon</IconLink>,
                properties: [
                    {label: "Type", value: wt?.name ?? `#${weapon.weaponType}`},
                    {label: "Min Damage", value: weapon.minDamage},
                    {label: "Max Damage", value: weapon.maxDamage},
                    {label: "Cooldown", value: fixFloat(weapon.cooldown)},
                    {label: "Stamina Mult", value: `${fixFloat(weapon.staminaUseMultiplier)}x`},
                ],
            });
        }

        // Food
        const food = foodData();
        if (food) {
            groups.push({
                heading: <IconLink href={`/database/food/${i.id}`} icon={pageIcon("Food")}>Food</IconLink>,
                properties: [
                    {label: "Satiation", value: food.hunger ? fixFloat(food.hunger) : undefined},
                    {label: "HP", value: food.hp ? fixFloat(food.hp) : undefined},
                    {label: "Up To HP", value: food.upToHp ? fixFloat(food.upToHp) : undefined},
                    {label: "Stamina", value: food.stamina ? fixFloat(food.stamina) : undefined},
                    {label: "Up To Stamina", value: food.upToStamina ? fixFloat(food.upToStamina) : undefined},
                    {label: "Teleportation Energy", value: food.teleportationEnergy ? fixFloat(food.teleportationEnergy) : undefined},
                    {label: "Consumable In Combat", value: food.consumableWhileInCombat || undefined},
                ],
            });
            // Food buff stat groups
            groups.push(...foodBuffGroups());
        }

        // Knowledge Scroll
        const scroll = scrollData();
        if (scroll) {
            const itemTag = i.tag;
            const statMod = knowledgeStatData();
            groups.push({
                heading: <IconLink href={`/database/knowledge/${scroll.secondaryKnowledgeId}`} icon={pageIcon("Knowledge")}>Knowledge Scroll</IconLink>,
                properties: [
                    {label: "Title", value: scroll.title},
                    {label: "Tag", value: scroll.tag !== itemTag ? scroll.tag : undefined},
                    {label: "Known By Default", value: scroll.knownByDefault || undefined},
                    {label: "Auto Collect", value: scroll.autoCollect || undefined},
                    ...(statMod?.stats?.length ? statMod.stats.map((s: any) => ({
                        label: splitCamelCase(s.id?.tag ?? ""),
                        value: `${fixFloat(s.value * (s.isPct ? 100 : 1))}${s.isPct ? "%" : ""}`,
                    })) : [])
                ],
            });
        }

        return groups;
    });

    return (
        <DetailPageLayout
            title={item()?.name ?? `Item #${params.id}`}
            breadcrumb={breadcrumb("/database/item")}
            loading={isLoading() && !item()}
            icon={<Show when={item()}>{i => <ItemIcon item={i()} small={false} noInteract/>}</Show>}
            name={item()?.name ?? "Item not found"}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            description={item()?.description}
            tag={item()?.tag}
            details={detailGroups()}
            rawData={item()}
            spacetimeTable={BitCraftTables.ItemDesc.st_name}
            objectId={item()?.id}
            chatLink={`(item=${item()?.id})`}
            summaryContent={placeablePlacements().length === 1 ? () => (
                <div class="flex flex-col items-center gap-2 py-2">
                    <p class="text-sm text-muted-foreground">This item starts a placeable lifecycle chain.</p>
                    <A href={`/tools/placeable-graph?placement=${placeablePlacements()[0].id}`}
                       class="text-sm font-medium hover:underline">
                        View full lifecycle in Placeable Graph →
                    </A>
                </div>
            ) : undefined}
            tabs={!item() ? [] : [
                craftedFromTab(craftedFrom()),
                craftsIntoTab(craftsInto()),
                extractionTab(extractionDrops(), extractionUses()),
                depletionTab(extractionDrops(), extractionUses(), depletionSources()),
                enemyDropsTab(enemyDrops()),
                constructionCombinedTab(constructsInto(), deconstructedFrom()),
                conversionTab(conversionInputs(), conversionOutputs()),
                travelerTasksTab(taskRewards(), taskRequires()),
                travelerTradesTab(tradeOffers(), tradeRequires()),
                itemListTab(isItemList()),
                itemListsTab(inItemLists()),
                collectiblesTab(collectibleData()),
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewards()),
                placeablePlacementTab(placeablePlacements()),
                placeableInteractionsTab(placeableInteractions()),
                ...(item()?.id === 164053808 && easterEggs() ? [lootTabWith({loot: [[1602206011, "Item", 1687372047]], chest: [item()!.iconAssetName, item()!.rarity, item()!.tier]})] : [])
            ]}
        />
    );
}
