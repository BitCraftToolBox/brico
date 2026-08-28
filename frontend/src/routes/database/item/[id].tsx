import {msg} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {A, useParams} from "@solidjs/router";
import {createMemo, Show} from "solid-js";
import {BuffEffect} from "~/bindings/src/buff_effect_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {lootTabWith} from "~/components/fun/BricoLootBox";
import {DetailGroup, DetailPageLayout} from "~/components/shared/DetailPageLayout";
import {ItemIcon} from "~/components/shared/GameIcon";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {BuffLinkById, IconLink, IconSpan, pageIcon, SkillLinkById} from "~/lib/game-links";
import {equipmentSlotLabel, statLabel} from "~/lib/game-strings";
import {gameText, useLabel} from "~/lib/labels";
import {ogImageForAsset} from "~/lib/og-meta";
import {interactionsInvolvingItem, placementsConsumingItem} from "~/lib/placeables";
import {
    claimResearchRequiring,
    constructionRecipesConsuming,
    conversionRecipesConsuming,
    conversionRecipesProducing,
    craftingRecipesConsuming,
    craftingRecipesProducing,
    deconstructionRecipesProducing,
    enemiesDropping,
    extractionRecipesConsuming,
    extractionRecipesDropping,
    foodDescsYielding,
    itemListsContaining,
    questDropSourcesFor,
    questsRequiringItem,
    questsRewardingItem,
    questsWithStageConditionItem,
    resourcesYielding,
    terraformRecipesDropping,
    travelerTasksRequiring,
    travelerTasksRewarding,
    travelerTradesOffering,
    travelerTradesRequiring,
} from "~/lib/relations";
import {useSettings} from "~/lib/settings";
import {BitCraftTables, useTablesLoading} from "~/lib/spacetime";
import {buffsGroups} from "~/lib/table-utils/detail-group-builders";
import {
    claimResearchTab,
    collectiblesTab,
    constructionCombinedTab,
    conversionTab,
    craftedFromTab,
    craftsIntoTab,
    depletionTab,
    enemyDropsTab,
    extractionTab,
    foodByproductsTab,
    itemListsTab,
    itemListTab,
    placeableInteractionsTab,
    placeablePlacementTab,
    questRequirementsTab,
    questRewardsTab,
    terraformDropsTab,
    travelerTasksTab,
    travelerTradesTab,
} from "~/lib/table-utils/detail-tab-builders";
import {fixFloat} from "~/lib/utils";

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
        return itemIndex().get(id);
    });

    const toolData = createMemo(() => item() ? toolIndex().get(item()!.id) : undefined);
    const equipData = createMemo(() => item() ? equipIndex().get(item()!.id) : undefined);
    const foodData = createMemo(() => item() ? foodIndex().get(item()!.id) : undefined);
    const weaponData = createMemo(() => item() ? weaponIndex().get(item()!.id) : undefined);
    const scrollData = createMemo(() => item() ? knowledgeScrollIndex().get(item()!.id) : undefined);
    const collectibleData = createMemo(() => {
        const i = item();
        if (!i) return [];
        const coll = collectibleIndex();
        return coll.get(i.id) ?? [];
    });

    const knowledgeStatData = createMemo(() => {
        const scroll = scrollData();
        if (!scroll) return undefined;
        return BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")().get(scroll.secondaryKnowledgeId);
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
    const terraformOutputs = createMemo(() => itemId() != null ? terraformRecipesDropping(itemId()!, itemType) : []);
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
    const researchRequires = createMemo(() => itemId() != null ? claimResearchRequiring(itemId()!, itemType) : []);
    const foodYields = createMemo(() => foodData()?.outputItemStacks?.length ? [foodData()!] : []);
    const foodByproductOf = createMemo(() => itemId() != null ? foodDescsYielding(itemId()!, itemType) : []);
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
        const label = useLabel();

        // General
        groups.push({
            properties: [
                {label: msg`Volume`, value: () => (
                    <Tooltip openOnTouchStart>
                        <TooltipTrigger class="decoration-dotted underline">{i.volume}</TooltipTrigger>
                        <TooltipContent class="max-w-[90svw]">
                            <Trans>Inventory stack: {6000 / i.volume}</Trans>
                        </TooltipContent>
                    </Tooltip>
                )},
                {label: msg`Durability`, value: i.durability > 0 ? i.durability : undefined},
                {label: msg`Compendium Entry`, value: !i.compendiumEntry ? false : undefined},
            ],
        });

        // Tool
        const tool = toolData();
        if (tool) {
            const toolType = toolTypeIndex().get(tool.toolType);
            groups.push({
                heading: () => <IconSpan icon={pageIcon("Tools")}>{label(gameText(msg`Tool`))}</IconSpan>,
                properties: [
                    {label: msg`Type`, value: toolType?.name ?? `#${tool.toolType}`},
                    {label: gameText(msg`Power`), value: tool.power},
                    {label: gameText(msg`Level`), value: tool.level},
                    {label: gameText(msg`Skill`), value: toolType?.skillId ? () => <SkillLinkById skillId={toolType.skillId}/> : undefined},
                ],
            });
        }

        // Equipment
        const equip = equipData();
        if (equip) {
            const eqProps: DetailGroup["properties"] = [
                {label: msg`Slots`, value: equip.slots?.map((s: any) => equipmentSlotLabel(s.tag)).join(", ")},
            ];
            if (equip.levelRequirement) {
                eqProps.push({label: msg`Required Skill`, value: () => <SkillLinkById skillId={equip.levelRequirement!.skillId}/>});
                eqProps.push({label: msg`Required Level`, value: equip.levelRequirement.level});
            }
            const eqGroup: DetailGroup = {heading: () => <IconSpan icon={pageIcon("Equipment")}>{label(gameText(msg`Equipment`))}</IconSpan>, properties: eqProps};
            groups.push(eqGroup);
            if (equip.stats?.length) {
                groups.push({
                    heading: () => <IconSpan icon={pageIcon("Equipment")}>{label(gameText(msg`Stats`))}</IconSpan>,
                    properties: equip.stats.map((stat: any) => ({
                        label: statLabel(stat.id?.tag),
                        value: `${fixFloat(stat.value * (stat.isPct ? 100 : 1))}${stat.isPct ? "%" : ""}`,
                    })),
                });
            }
            if (equip.equipmentBuffId) {
                groups.push({
                    heading: () => <IconSpan icon={pageIcon("Equipment")}>{label(gameText(msg`Buffs`))}</IconSpan>,
                    properties: [
                        {label: gameText(msg`Skill`), value: () => <SkillLinkById skillId={equip.equipmentBuffSkillId}/>},
                        {label: msg`Chance per hit`, value: `${fixFloat(equip.equipmentBuffChancePerHit * 100)}%`},
                        {label: gameText(msg`Buff`), value: () => <BuffLinkById buffId={equip.equipmentBuffId}/>}
                    ],
                });
                groups.push(...buffsGroups([{buffId: equip.equipmentBuffId, duration: undefined} satisfies BuffEffect]));
            }
        }

        // Weapon
        const weapon = weaponData();
        if (weapon) {
            const wt = weaponTypeIndex()?.get(weapon.weaponType);
            groups.push({
                heading: () => <IconSpan icon={pageIcon("Weapons")}>{label(gameText(msg`Weapon`))}</IconSpan>,
                properties: [
                    {label: msg`Type`, value: wt?.name ?? `#${weapon.weaponType}`},
                    {label: msg`Min Damage`, value: weapon.minDamage},
                    {label: msg`Max Damage`, value: weapon.maxDamage},
                    {label: gameText(msg`Cooldown`), value: fixFloat(weapon.cooldown)},
                    {label: gameText(msg`Stamina`), value: `${fixFloat(weapon.staminaUseMultiplier)}x`},
                ],
            });
        }

        // Food
        const food = foodData();
        if (food) {
            groups.push({
                heading: () => <IconSpan icon={pageIcon("Food")}>{label(gameText(msg`Food`))}</IconSpan>,
                properties: [
                    {label: gameText(msg`Satiation`), value: food.hunger ? fixFloat(food.hunger) : undefined},
                    {label: gameText(msg`Health`), value: food.hp ? fixFloat(food.hp) : undefined},
                    {label: gameText(msg`Min Health`), value: food.upToHp ? fixFloat(food.upToHp) : undefined},
                    {label: gameText(msg`Stamina`), value: food.stamina ? fixFloat(food.stamina) : undefined},
                    {label: gameText(msg`Min Stamina`), value: food.upToStamina ? fixFloat(food.upToStamina) : undefined},
                    {label: gameText(msg`TP Energy`, "Teleportation Energy"), value: food.teleportationEnergy ? fixFloat(food.teleportationEnergy) : undefined},
                    {label: msg`Consumable In Combat`, value: food.consumableWhileInCombat},
                    {label: msg`Auto Consume`, value: food.autoConsume},
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
                heading: () => <IconLink href={`/database/knowledge/${scroll.secondaryKnowledgeId}`} icon={pageIcon("Knowledge")}>{label(gameText(msg`Knowledge Scroll`))}</IconLink>,
                properties: [
                    {label: gameText(msg`Title`), value: scroll.title},
                    {label: gameText(msg`Tag`), value: scroll.tag !== itemTag ? scroll.tag : undefined},
                    {label: msg`Known By Default`, value: scroll.knownByDefault || undefined},
                    {label: msg`Auto Collect`, value: scroll.autoCollect || undefined},
                    ...(statMod?.stats?.length ? statMod.stats.map((s: any) => ({
                        label: statLabel(s.id?.tag),
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
            breadcrumbHref="/database/item"
            loading={isLoading() && !item()}
            icon={<Show when={item()}>{i => <ItemIcon item={i()} small={false} noInteract/>}</Show>}
            name={item()?.name ?? "Item not found"}
            tier={item()?.tier}
            rarity={item()?.rarity?.tag}
            description={item()?.description}
            tag={item()?.tag}
            metaKind="item"
            metaImage={ogImageForAsset(item()?.iconAssetName)}
            details={detailGroups()}
            rawData={item()}
            spacetimeTable={BitCraftTables.ItemDesc.spacetimeName}
            objectId={item()?.id}
            chatLink={`(item=${item()?.id})`}
            summaryContent={placeablePlacements().length === 1 ? () => (
                <div class="flex flex-col items-center gap-2 py-2">
                    <p class="text-sm text-muted-foreground"><Trans>This item starts a placeable lifecycle chain.</Trans></p>
                    <A href={`/tools/placeable-graph?placement=${placeablePlacements()[0].id}`}
                       class="text-sm font-medium hover:underline">
                        <Trans>View full lifecycle in Placeable Graph →</Trans>
                    </A>
                </div>
            ) : undefined}
            tabs={!item() ? [] : [
                craftedFromTab(craftedFrom()),
                craftsIntoTab(craftsInto()),
                extractionTab(extractionDrops(), extractionUses(), undefined, !!isItemList()),
                depletionTab(extractionDrops(), extractionUses(), depletionSources()),
                enemyDropsTab(enemyDrops()),
                terraformDropsTab(terraformOutputs()),
                foodByproductsTab(foodYields(), foodByproductOf()),
                constructionCombinedTab(constructsInto(), deconstructedFrom()),
                conversionTab(conversionInputs(), conversionOutputs()),
                travelerTasksTab(taskRewards(), taskRequires()),
                travelerTradesTab(tradeOffers(), tradeRequires()),
                collectiblesTab(collectibleData()),
                questRequirementsTab(questRequires()),
                questRewardsTab(questRewards()),
                placeablePlacementTab(placeablePlacements()),
                placeableInteractionsTab(placeableInteractions()),
                claimResearchTab(researchRequires()),
                itemListTab(isItemList(), true),
                itemListsTab(inItemLists()),
                ...(item()?.id === 164053808 && easterEggs() ? [lootTabWith({loot: [[1602206011, "Item", 1687372047]], chest: [item()!.iconAssetName, item()!.rarity, item()!.tier]})] : [])
            ]}
        />
    );
}
