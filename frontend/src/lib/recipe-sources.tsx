/**
 * Recipe Helpers — Stat line extraction, stack utilities, and display helpers.
 *
 * Stat lines are [label, value] pairs shown below recipe visuals.
 * Each recipe type has its own stat line extraction function.
 *
 * Stack utilities: collapseStacks, collapseCargoIds for grouping stacks.
 * Shared helpers: skillReqPair, toolReqPair, skillExpPair for common stat patterns.
 */

import {t} from "@lingui/core/macro";
import {Trans} from "@lingui/solid/macro";
import {JSX, Show} from "solid-js";
import {Biome} from "~/bindings/src/biome_type";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {ExperienceStackF32} from "~/bindings/src/experience_stack_f_32_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemListDesc} from "~/bindings/src/item_list_desc_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {LevelRequirement} from "~/bindings/src/level_requirement_type";
import {PlaceableDesc} from "~/bindings/src/placeable_desc_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {PlaceableSelfBuffChance} from "~/bindings/src/placeable_self_buff_chance_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {ToolRequirement} from "~/bindings/src/tool_requirement_type";
import {ToolTypeDesc} from "~/bindings/src/tool_type_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {BiomeLink, IconLink, IconSpan, KnowledgeLinkById, knowledgeStatIcon, LinkedList, pageIcon, SkillLink, skillStatIcon, toolStatIcon,} from "~/lib/game-links";
import {trackUILocale} from "~/lib/i18n";
import {getItemListSource, getTravelerNpcName} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {fixFloat, readableSeconds} from "~/lib/utils";

// ─── Stat Line Type ─────────────────────────────────────────────

export type StatLine = [
    string | (() => JSX.Element),
    string | number | (() => JSX.Element),
];

// ─── Shared Helpers ─────────────────────────────────────────────

export function skillReqPair(req: LevelRequirement, skillData: Map<any, SkillDesc>): StatLine | null {
    const skill = skillData.get(req.skillId);
    let skillTag: string = skill?.skillCategory.tag ?? "";
    if (!skillTag || skillTag === "None") return null;
    if (skillTag === "Adventure") skillTag = "Skill";
    return [
        () => <IconSpan icon={skillStatIcon(skill)}><Trans>{skillTag}:</Trans></IconSpan>,
        () => <span><Trans>Lv. {req.level} {skill ? <SkillLink skill={skill} showIcon={false}/> : `Skill #${req.skillId}`}</Trans></span>,
    ];
}

/** Shared by `toolReqPair` and the terraforming detail page, which needs the text without the icon half. */
export function toolRequirementText(level: number, toolName: string, power: number): string {
    trackUILocale();
    return power > 1 ? t`Level ${level} ${toolName} (Power >= ${power})` : t`Level ${level} ${toolName}`;
}

export function toolReqPair(req: ToolRequirement, toolData: Map<any, ToolTypeDesc>): StatLine | null {
    const tool = toolData.get(req.toolType);
    if (!tool) return null;
    return [
        () => <IconSpan icon={toolStatIcon()}><Trans>Tool:</Trans></IconSpan>,
        toolRequirementText(req.level, tool.name, req.power),
    ];
}

export function skillExpPair(xp: ExperienceStackF32, total: number | undefined, skillData: Map<any, SkillDesc>): StatLine | null {
    if (!xp.quantity) return null;
    trackUILocale();
    const totalXp = total ? total * xp.quantity : null;
    const perHit = fixFloat(xp.quantity);
    const elem = totalXp ? t`${perHit} (Total: ${fixFloat(totalXp)})` : String(perHit);
    const skill = skillData.get(xp.skillId);
    const skillName = skill?.name ?? t`Skill`;
    return [
        () => <IconSpan icon={skillStatIcon(skill)}><Trans>{skillName} XP/Progress:</Trans></IconSpan>,
        elem,
    ];
}

type RecipeWithKnowledge = {
    requiredKnowledges: number[];
} | {
    blockingKnowledges: number[];
} | {
    requiredKnowledges: number[];
    blockingKnowledges: number[];
}

function addKnowledgeRequirements(lines: StatLine[], recipe: RecipeWithKnowledge) {
    if ('requiredKnowledges' in recipe && Array.isArray(recipe.requiredKnowledges) && recipe.requiredKnowledges.length) {
        const ids = Array.from(new Set(recipe.requiredKnowledges));
        lines.push([
            () => <IconSpan icon={knowledgeStatIcon()}><Trans>Required Knowledge:</Trans></IconSpan>,
            () => <LinkedList>
                {ids.map((id) => (
                    <KnowledgeLinkById id={id} showIcon={false}/>
                ))}
            </LinkedList>
        ]);
    }
    if ('blockingKnowledges' in recipe && Array.isArray(recipe.blockingKnowledges) && recipe.blockingKnowledges.length) {
        const ids = Array.from(new Set(recipe.blockingKnowledges));
        lines.push([
            () => <IconSpan icon={knowledgeStatIcon()}><Trans>Blocking Knowledge:</Trans></IconSpan>,
            () => <LinkedList>
                {ids.map((id) => (
                    <KnowledgeLinkById id={id} showIcon={false}/>
                ))}
            </LinkedList>
        ]);
    }
}

/** Shared: add level requirements, experience, and tool requirements to stat lines */
function addCommonRequirements(
    lines: StatLine[],
    recipe: {
        levelRequirements: LevelRequirement[];
        experiencePerProgress: ExperienceStackF32[];
        toolRequirements: ToolRequirement[];
    },
    totalEffort?: number
) {
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")();
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")();

    recipe.levelRequirements.forEach(req => {
        const pair = skillReqPair(req, skillData);
        if (pair) lines.push(pair);
    });
    recipe.experiencePerProgress.forEach(xp => {
        const pair = skillExpPair(xp, totalEffort, skillData);
        if (pair) lines.push(pair);
    });
    recipe.toolRequirements.forEach(req => {
        const pair = toolReqPair(req, toolData);
        if (pair) lines.push(pair as StatLine);
    });
}

function addUseHandsInformation(lines: StatLine[], recipe: { toolRequirements: ToolRequirement[], allowUseHands: boolean }) {
    if (!recipe.toolRequirements.length && recipe.allowUseHands) {
        lines.push([() => <IconSpan icon={toolStatIcon()}><Trans>Tool:</Trans></IconSpan>,
            () => <Tooltip openOnTouchStart>
                <TooltipTrigger class="underline decoration-dotted"><Trans>No tool</Trans></TooltipTrigger>
                <TooltipContent class="max-w-[50ch]"><Trans>This recipe uses your hands, ignoring your equipped tool power, but including crits and knowledge which increases power.</Trans></TooltipContent>
            </Tooltip>
        ])
    }
}

// ─── Per-Type Stat Line Extractors ──────────────────────────────

export function craftingStatLines(recipe: CraftingRecipeDesc): StatLine[] {
    trackUILocale();
    const buildingData = BitCraftTables.BuildingTypeDesc.indexedBy("id")();
    const lines: StatLine[] = [
        [t`Effort:`, recipe.actionsRequired],
        [t`Time:`, fixFloat(recipe.timeRequirement)],
        [t`Stamina:`, fixFloat(recipe.staminaRequirement)],
    ];
    addCommonRequirements(lines, recipe, recipe.actionsRequired);
    addUseHandsInformation(lines, recipe);
    if (recipe.buildingRequirement) {
        const name = buildingData.get(recipe.buildingRequirement.buildingType)?.name ?? t`Unknown`;
        const tier = recipe.buildingRequirement.tier;
        lines.push([() => <IconSpan icon={pageIcon("Structures")}><Trans>Building:</Trans></IconSpan>, t`Tier ${tier} ${name}`]);
    }
    addKnowledgeRequirements(lines, recipe);
    return lines;
}

export function prospectingForResource(resource: number) {
    const prospecting = BitCraftTables.ProspectingDesc.indexedByMulti("resourceClumpId")();
    const clumps = BitCraftTables.ResourceClumpDesc.get();
    return clumps?.filter(c => c.resourceId.includes(resource))
        .flatMap(c => prospecting.get(c.id))
        .filter((p): p is NonNullable<typeof p> => !!p) ?? [];
}

export function prospectingForEnemy(enemyType: number) {
    const prospecting = BitCraftTables.ProspectingDesc.indexedByMulti("enemyAiDescId")();
    const enemyAiParams = BitCraftTables.EnemyAiParamsDesc.get();
    if (!enemyAiParams) return [];
    const typeMap = BitCraftTables.EnemyAiParamsDesc.tagToOrdinal("enemyType");
    return enemyAiParams.filter(par => typeMap.get(par.enemyType.tag) === enemyType)
        .flatMap(par => prospecting.get(par.id) ?? []) ?? [];
}

export function extractionStatLines(recipe: ExtractionRecipeDesc, resource?: ResourceDesc): StatLine[] {
    trackUILocale();
    const lines: StatLine[] = [];
    let totalEffort = resource?.maxHealth;
    if (resource) {
        const growths = BitCraftTables.ResourceGrowthRecipeDesc.indexedBy("resourceId");
        const gd = growths().get(resource.id);
        if (gd) {
            const [min, max] = gd.time;
            lines.push([t`Timed Node`, min == max ? `${readableSeconds(min)}` : `${readableSeconds(min)} - ${readableSeconds(max)}`]);
        } else if (resource.showTimeLeft) { // unsure if any resource has this flag but doesn't have a growth desc, but fallback anyway
            lines.push([t`Timed Node`, t`? min`])
        }
        const prospectingDescs = prospectingForResource(resource.id);
        if (prospectingDescs?.length) {
            if (prospectingDescs.length == 1) {
                const prospect = prospectingDescs[0];
                const perNode = prospect.contributionPerVisitedBreadCrumb;
                const [min, max] = prospect.breadCrumbCount;
                lines.push([t`Prospecting Hits`,
                    () => <Show when={prospect.singleContributionOnly} fallback={
                        <Tooltip openOnTouchStart>
                            <TooltipTrigger class="decoration-dotted underline">{min * perNode}{min != max ? `- ${max * perNode}` : ""}</TooltipTrigger>
                            <TooltipContent class="max-w-[90svw]">
                                <Show when={min == max} fallback={
                                    <Trans>{perNode} contribution per node × {min} - {max} nodes = {(min + max) / 2 * perNode} hits average</Trans>
                                }>
                                    <Trans>{perNode} contribution per node × {min} nodes = {(min + max) / 2 * perNode} hits</Trans>
                                </Show>
                            </TooltipContent>
                        </Tooltip>
                    }>
                        <Tooltip openOnTouchStart>
                            <TooltipTrigger class="decoration-dotted underline">1</TooltipTrigger>
                            <TooltipContent class="max-w-[90svw]"><Trans>This prospecting is fixed at one contribution, regardless of bread crumb count.</Trans></TooltipContent>
                        </Tooltip>
                    </Show>
                ]);
            }
        }
        if (resource.ignoreDamage) {
            lines.push([t`Total HP`,
                () => <Tooltip openOnTouchStart>
                    <TooltipTrigger class="decoration-dotted underline">{resource.maxHealth}</TooltipTrigger>
                    <TooltipContent><Trans>Resource ignores regular damage.</Trans></TooltipContent>
                </Tooltip>
            ]);
            totalEffort = 0;
        } else {
            lines.push([t`Total HP`, resource.maxHealth]);
        }
    }
    lines.push([t`Time:`, fixFloat(recipe.timeRequirement)]);
    lines.push([t`Stamina:`, fixFloat(recipe.staminaRequirement)]);
    addCommonRequirements(lines, recipe, totalEffort);
    addUseHandsInformation(lines, recipe);
    addKnowledgeRequirements(lines, recipe);
    addPlaceableSelfBuffs(lines, recipe.selfBuffs);
    return lines;
}

export function constructionStatLines(recipe: ConstructionRecipeDesc): StatLine[] {
    trackUILocale();
    const lines: StatLine[] = [
        [t`Effort:`, recipe.actionsRequired],
        [t`Time:`, fixFloat(recipe.timeRequirement)],
        [t`Stamina:`, fixFloat(recipe.staminaRequirement)],
    ];
    addCommonRequirements(lines, recipe, recipe.actionsRequired);
    addKnowledgeRequirements(lines, recipe);
    return lines;
}

export function deconstructionStatLines(recipe: DeconstructionRecipeDesc): StatLine[] {
    trackUILocale();
    const lines: StatLine[] = [
        [t`Time:`, fixFloat(recipe.timeRequirement)],
    ];
    addCommonRequirements(lines, recipe);
    return lines;
}

export function conversionStatLines(recipe: ItemConversionRecipeDesc): StatLine[] {
    trackUILocale();
    return [
        [t`Time:`, fixFloat(recipe.timeCost)],
        [t`Stamina:`, fixFloat(recipe.staminaCost)],
    ];
}

export function travelerTaskStatLines(task: TravelerTaskDesc): StatLine[] {
    trackUILocale();
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")();
    const skill = skillData.get(task.levelRequirement.skillId);
    let skillTag = skill?.skillCategory.tag ?? "";
    if (skillTag === "Adventure") skillTag = "Skill";
    const skillName = skill?.name ?? t`Skill`;

    const lines: StatLine[] = [
        [
            () => <span class="inline-flex items-center gap-1">{skillStatIcon(skill)} <Trans>{skillTag}:</Trans></span>,
            () => <span><Trans>Lv. {task.levelRequirement.minLevel}-{task.levelRequirement.maxLevel} {skill ? <SkillLink skill={skill} showIcon={false}/> : <Trans>Unknown</Trans>}</Trans></span>,
        ],
        [
            () => <span class="inline-flex items-center gap-1">{skillStatIcon(skill)} <Trans>{skillName} Exp:</Trans></span>,
            fixFloat(task.rewardedExperience.quantity),
        ],
    ];
    const taskKnowledge = BitCraftTables.TravelerTaskKnowledgeRequirementDesc.indexedBy("travelerTaskId")().get(task.id);
    if (taskKnowledge) {
        addKnowledgeRequirements(lines, taskKnowledge);
    }
    return lines;
}

export function travelerTradeStatLines(trade: TravelerTradeOrderDesc): StatLine[] {
    trackUILocale();
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")();
    const npcName = getTravelerNpcName(trade.traveler.tag);
    const lines: StatLine[] = [[t`Traveler:`, npcName]];
    trade.levelRequirements.forEach(req => {
        const pair = skillReqPair(req, skillData);
        if (pair) lines.push(pair);
    });
    addKnowledgeRequirements(lines, trade as any);
    return lines;
}

export function itemListLootWeightedComponent(weighted: boolean) {
    return weighted ? (
        <Tooltip openOnTouchStart>
            <TooltipTrigger class="decoration-dotted underline"><Trans>Yes</Trans></TooltipTrigger>
            <TooltipContent><Trans>Output is rolled a number of times equal to your contribution. One full HP bar of the enemy is worth 1000 contribution.</Trans></TooltipContent>
        </Tooltip>
    ) : (
        <Tooltip openOnTouchStart>
            <TooltipTrigger class="decoration-dotted underline"><Trans>No</Trans></TooltipTrigger>
            <TooltipContent><Trans>Output is rolled once, regardless of damage dealt, as long as the minimum threshold is reached.</Trans></TooltipContent>
        </Tooltip>
    )
}

export function itemListStatLines(list: ItemListDesc): StatLine[] {
    trackUILocale();
    const source = getItemListSource(list);
    if (source.type !== "Enemy") return [];
    const loot = source.loot;
    return [
        [t`Minimum Contribution`, loot.minimumContribution],
        [t`Weighted`, () => itemListLootWeightedComponent(loot.weighted)],
    ];
}

// ─── Placeable Stat Line Extractors ─────────────────────────────

export function placementStatLines(placement: PlaceablePlacementDesc): StatLine[] {
    trackUILocale();
    const lines: StatLine[] = [
        [t`Time:`, fixFloat(placement.requiredTime)],
    ];

    // Biome requirements
    if (placement.requiredBiomes.length) {
        const biomeOrdinals = BitCraftTables.PlaceablePlacementDesc.tagToOrdinal("requiredBiomes");
        const biomeIndex = BitCraftTables.BiomeDesc.indexedBy("biomeType", true);
        function tagToBiomeLink(tag: string) {
            const descId = biomeOrdinals.get(tag);
            const desc = biomeIndex().get(descId);
            return descId ? <BiomeLink biomeType={descId} name={desc?.name} showIcon={false}/> : tag;
        }
        lines.push([
            () => <IconSpan icon={pageIcon("Biomes")}><Trans>Biomes:</Trans></IconSpan>,
            () => <LinkedList>{placement.requiredBiomes.map((b: Biome) => tagToBiomeLink(b.tag))}</LinkedList>
        ]);
    }

    // Paving/Interior tier
    if (placement.requiredPavingTier > 0) {
        lines.push([t`Paving Tier:`, placement.requiredPavingTier]);
    }
    if (placement.requiredInteriorTier > 0) {
        lines.push([t`Interior Tier:`, placement.requiredInteriorTier]);
    }
    if (placement.requiredClaimTier > 0) {
        lines.push([() => <IconSpan icon={pageIcon("Claim Research")}><Trans>Claim Tier:</Trans></IconSpan>, placement.requiredClaimTier]);
    }

    // Level/tool/knowledge requirements
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")();
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")();
    placement.levelRequirements.forEach(req => {
        const pair = skillReqPair(req, skillData);
        if (pair) lines.push(pair);
    });
    placement.toolRequirements.forEach(req => {
        const pair = toolReqPair(req, toolData);
        if (pair) lines.push(pair as StatLine);
    });
    addKnowledgeRequirements(lines, placement);

    const groupIdx = BitCraftTables.PlaceableGroupDesc.get();
    const groupLimits = (groupIdx ?? [])
        .filter(g => g.placeableIds.includes(placement.placedPlaceableId))
        .filter(g => g.placementLimit);

    for (const group of groupLimits) {
        lines.push([() => <IconSpan icon={pageIcon("Placeables")}><Trans>Group limit for {group.name}:</Trans></IconSpan>, group.placementLimit]);
    }

    // Distance constraints
    if (placement.minDistanceToGroup > 0) {
        lines.push([() => <IconSpan icon={pageIcon("Placeables")}><Trans>Minimum distance to Group:</Trans></IconSpan>, placement.minDistanceToGroup])
    }
    if (placement.minDistanceToPlayerClaims > 0) {
        lines.push([() => <IconSpan icon={pageIcon("Claim Research")}><Trans>Minimum distance to Claims:</Trans></IconSpan>, placement.minDistanceToPlayerClaims]);
    }
    // Building proximity
    if (placement.buildings.length) {
        const buildingIndex = BitCraftTables.BuildingDesc.indexedBy("id")();
        const names = placement.buildings
            .map(id => buildingIndex.get(id)?.name ?? `Building #${id}`)
            .join(", ");
        lines.push([() => <IconSpan icon={pageIcon("Structures")}><Trans>Near Building:</Trans></IconSpan>, `${names} (≤${placement.maxDistanceToBuildings}m)`]);
    }

    addPlaceableSelfBuffs(lines, placement.selfBuffs);

    return lines;
}

function addPlaceableSelfBuffs(lines: StatLine[], placeableBuffs: PlaceableSelfBuffChance[] | undefined) {
    if (placeableBuffs?.length) {
        const buffIdx = BitCraftTables.BuffDesc.indexedBy("id")();
        lines.push(...placeableBuffs.map(b => {
            const buff = buffIdx.get(b.buffId);
            const duration = b.duration ?? buff?.duration;
            return [
                () => (
                    <IconSpan icon={pageIcon("Buffs")}><Trans>Buff</Trans></IconSpan>
                ),
                () => (
                    <IconLink href={`/database/buff/${b.buffId}`}>
                        {buff?.description ?? `Buff #${b.buffId}`}
                        {duration ? <span class="text-muted-foreground">{readableSeconds(fixFloat(duration))}</span> : null}
                        {
                            <Tooltip>
                                <TooltipTrigger class="text-muted-foreground decoration-dotted underline">
                                    ({fixFloat(b.chance * 100)}%)
                                </TooltipTrigger>
                                <TooltipContent>
                                    <Trans>Chance per hit</Trans>
                                </TooltipContent>
                            </Tooltip>
                        }
                    </IconLink>
                )
            ] satisfies StatLine;
        }));
    }
}

export function interactionStatLines(interaction: PlaceableInteractionDesc, sourcePlaceable: PlaceableDesc | undefined): StatLine[] {
    trackUILocale();
    const lines: StatLine[] = [
        [t`Time:`, fixFloat(interaction.timeRequirement)],
        [t`Stamina:`, fixFloat(interaction.staminaRequirement)],
    ];

    if (sourcePlaceable?.maxHealth) {
        lines.push([t`Effort Required:`, sourcePlaceable?.maxHealth]);
    }

    if (interaction.range > 1) {
        lines.push([t`Range:`, interaction.range]);
    }

    // Common requirements (level, xp, tool)
    addCommonRequirements(lines, interaction);
    addUseHandsInformation(lines, interaction);
    addKnowledgeRequirements(lines, interaction);
    addPlaceableSelfBuffs(lines, interaction.selfBuffs);

    return lines;
}

export function growthStatLines(growth: PlaceableGrowthDesc): StatLine[] {
    trackUILocale();
    const minTime = growth.time[0] ?? 0;
    const maxTime = growth.time[1] ?? minTime;
    const lines: StatLine[] = [
        [t`Time:`, minTime === maxTime
            ? `${readableSeconds(fixFloat(minTime))}`
            : `${readableSeconds(fixFloat(minTime))} - ${readableSeconds(fixFloat(maxTime))}`],
    ];
    if (!growth.showTimeLeft) {
        lines.push([t`Shows Time Left:`, t`No`]);
    }
    return lines;
}

// ─── Stack Utilities ────────────────────────────────────────────

export function collapseStacks(stacks: ItemStack[], includeCargo: boolean = false): ItemStack[] {
    const cargoMap = new Map<number, ItemStack>();
    const itemMap = new Map<number, ItemStack>();
    for (const stack of stacks) {
        const targetMap = stack.itemType.tag === ItemType.Cargo.tag ? cargoMap : itemMap;
        if (targetMap.has(stack.itemId)) {
            targetMap.get(stack.itemId)!.quantity += stack.quantity;
        } else {
            targetMap.set(stack.itemId, {
                itemId: stack.itemId,
                quantity: stack.quantity,
                itemType: stack.itemType,
                durability: stack.durability
            } as ItemStack);
        }
    }
    return [...(includeCargo ? cargoMap.values() : []), ...itemMap.values()];
}
