/**
 * Recipe Helpers — Stat line extraction, stack utilities, and display helpers.
 *
 * Stat lines are [label, value] pairs shown below recipe visuals.
 * Each recipe type has its own stat line extraction function.
 *
 * Stack utilities: collapseStacks, collapseCargoIds for grouping stacks.
 * Shared helpers: skillReqPair, toolReqPair, skillExpPair for common stat patterns.
 */

import {JSX} from "solid-js";
import {Biome} from "~/bindings/src/biome_type";
import {ConstructionRecipeDesc} from "~/bindings/src/construction_recipe_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {DeconstructionRecipeDesc} from "~/bindings/src/deconstruction_recipe_desc_type";
import {ExperienceStackF32} from "~/bindings/src/experience_stack_f_32_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ItemConversionRecipeDesc} from "~/bindings/src/item_conversion_recipe_desc_type";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {LevelRequirement} from "~/bindings/src/level_requirement_type";
import {PlaceableGrowthDesc} from "~/bindings/src/placeable_growth_desc_type";
import {PlaceableInteractionDesc} from "~/bindings/src/placeable_interaction_desc_type";
import {PlaceablePlacementDesc} from "~/bindings/src/placeable_placement_desc_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {ResourceDesc} from "~/bindings/src/resource_desc_type";
import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {ToolRequirement} from "~/bindings/src/tool_requirement_type";
import {ToolTypeDesc} from "~/bindings/src/tool_type_desc_type";
import {TravelerTaskDesc} from "~/bindings/src/traveler_task_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {BiomeLink, IconSpan, KnowledgeLinkById, knowledgeStatIcon, LinkedList, pageIcon, SkillLink, skillStatIcon, toolStatIcon,} from "~/lib/game-links";
import {getTravelerNpcName} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";
import {fixFloat} from "~/lib/utils";

// ─── Stat Line Type ─────────────────────────────────────────────

export type StatLine = [JSX.Element | string, JSX.Element | string | number];

// ─── Shared Helpers ─────────────────────────────────────────────

export function skillReqPair(req: LevelRequirement, skillData: Map<any, SkillDesc>): StatLine | null {
    const skill = skillData.get(req.skillId);
    let skillTag: string = skill?.skillCategory.tag ?? "";
    if (!skillTag || skillTag === "None") return null;
    if (skillTag === "Adventure") skillTag = "Skill";
    return [
        <IconSpan icon={skillStatIcon(skill)}>{skillTag}:</IconSpan>,
        <span>Lv. {req.level} {skill ? <SkillLink skill={skill} showIcon={false}/> : `Skill #${req.skillId}`}</span>,
    ];
}

export function toolReqPair(req: ToolRequirement, toolData: Map<any, ToolTypeDesc>): StatLine | null {
    const tool = toolData.get(req.toolType);
    if (!tool) return null;
    return [
        <IconSpan icon={toolStatIcon()}>Tool:</IconSpan>,
        `Level ${req.level} ${tool.name}${req.power > 1 ? ` (Power >= ${req.power})` : ''}`,
    ];
}

export function skillExpPair(xp: ExperienceStackF32, total: number | undefined, skillData: Map<any, SkillDesc>): StatLine | null {
    if (!xp.quantity) return null;
    const totalXp = total ? total * xp.quantity : null;
    const perHit = fixFloat(xp.quantity);
    const elem = totalXp ? `${perHit} (Total: ${fixFloat(totalXp)})` : String(perHit);
    const skill = skillData.get(xp.skillId);
    return [
        <IconSpan icon={skillStatIcon(skill)}>{skill?.name ?? "Skill"} XP/Progress:</IconSpan>,
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
        lines.push([
            <IconSpan icon={knowledgeStatIcon()}>Required Knowledge</IconSpan>,
            <LinkedList>
                {Array.from(new Set(recipe.requiredKnowledges)).map((id) => (
                    <KnowledgeLinkById id={id} showIcon={false}/>
                ))}
            </LinkedList>,
        ]);
    }
    if ('blockingKnowledges' in recipe && Array.isArray(recipe.blockingKnowledges) && recipe.blockingKnowledges.length) {
        lines.push([
            <IconSpan icon={knowledgeStatIcon()}>Blocking Knowledge</IconSpan>,
            <LinkedList>
                {Array.from(new Set(recipe.blockingKnowledges)).map((id) => (
                    <KnowledgeLinkById id={id} showIcon={false}/>
                ))}
            </LinkedList>,
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
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")()!;

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

// ─── Per-Type Stat Line Extractors ──────────────────────────────

export function craftingStatLines(recipe: CraftingRecipeDesc): StatLine[] {
    const buildingData = BitCraftTables.BuildingTypeDesc.indexedBy("id")()!;
    const lines: StatLine[] = [
        ["Effort:", recipe.actionsRequired],
        ["Time:", fixFloat(recipe.timeRequirement)],
        ["Stamina:", fixFloat(recipe.staminaRequirement)],
    ];
    addCommonRequirements(lines, recipe, recipe.actionsRequired);
    if (recipe.buildingRequirement) {
        const name = buildingData.get(recipe.buildingRequirement.buildingType)?.name ?? "Unknown";
        lines.push([<IconSpan icon={pageIcon("Structures")}>Building:</IconSpan>, `Tier ${recipe.buildingRequirement.tier} ${name}`]);
    }
    addKnowledgeRequirements(lines, recipe);
    return lines;
}

export function prospectingForResource(resource: number | undefined) {
    if (resource === undefined) return undefined;
    const prospecting = BitCraftTables.ProspectingDesc.indexedBy("resourceClumpId")();
    const clumps = BitCraftTables.ResourceClumpDesc.get();
    return clumps?.filter(c => c.resourceId.includes(resource))
        .map(c => prospecting.get(c.id))
        .filter((v: ProspectingDesc | undefined): v is NonNullable<typeof v> => !!v);
}

export function extractionStatLines(recipe: ExtractionRecipeDesc, resource?: ResourceDesc): StatLine[] {
    const lines: StatLine[] = [];
    let totalEffort = resource?.maxHealth;
    if (resource) {
        if (resource?.showTimeLeft) {
            // TODO growth_recipe_desc is private
            lines.push(["Timed Node", "? min"])
            totalEffort = 0;
        } else {
            const prospectingDescs = prospectingForResource(recipe.resourceId);
            if (prospectingDescs?.length) {
                if (prospectingDescs.length == 1) {
                    const prospect = prospectingDescs[0];
                    const perNode = prospect.contributionPerVisitedBreadCrumb;
                    const [min, max] = prospect.breadCrumbCount;
                    lines.push(["Prospecting Hits",
                        <Tooltip>
                            <TooltipTrigger>{min * perNode} - {max * perNode}</TooltipTrigger>
                            <TooltipContent>{perNode} contribution per node, {min} - {max} nodes, {(min + max) / 2 * perNode} hits average</TooltipContent>
                        </Tooltip>
                    ]);
                }
                totalEffort = 0;
            }
        }
        lines.push(["Total HP", resource.maxHealth]);
    }
    lines.push(["Time:", fixFloat(recipe.timeRequirement)]);
    lines.push(["Stamina:", fixFloat(recipe.staminaRequirement)]);
    addCommonRequirements(lines, recipe, totalEffort);
    addKnowledgeRequirements(lines, recipe);
    return lines;
}

export function constructionStatLines(recipe: ConstructionRecipeDesc): StatLine[] {
    const lines: StatLine[] = [
        ["Effort:", recipe.actionsRequired],
        ["Time:", fixFloat(recipe.timeRequirement)],
        ["Stamina:", fixFloat(recipe.staminaRequirement)],
    ];
    addCommonRequirements(lines, recipe, recipe.actionsRequired);
    addKnowledgeRequirements(lines, recipe);
    return lines;
}

export function deconstructionStatLines(recipe: DeconstructionRecipeDesc): StatLine[] {
    const lines: StatLine[] = [
        ["Time:", fixFloat(recipe.timeRequirement)],
    ];
    addCommonRequirements(lines, recipe);
    return lines;
}

export function conversionStatLines(recipe: ItemConversionRecipeDesc): StatLine[] {
    return [
        ["Time:", fixFloat(recipe.timeCost)],
        ["Stamina:", fixFloat(recipe.staminaCost)],
    ];
}

export function travelerTaskStatLines(task: TravelerTaskDesc): StatLine[] {
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")()!;
    const skill = skillData.get(task.levelRequirement.skillId);
    let skillTag = skill?.skillCategory.tag ?? "";
    if (skillTag === "Adventure") skillTag = "Skill";

    const lines: StatLine[] = [
        [
            <span class="inline-flex items-center gap-1">{skillStatIcon(skill)} {skillTag}:</span>,
            <span>Lv. {task.levelRequirement.minLevel}-{task.levelRequirement.maxLevel} {skill ? <SkillLink skill={skill} showIcon={false}/> : "Unknown"}</span>,
        ],
        [
            <span class="inline-flex items-center gap-1">{skillStatIcon(skill)} {skill?.name ?? "Skill"} Exp:</span>,
            fixFloat(task.rewardedExperience.quantity),
        ],
    ];
    addKnowledgeRequirements(lines, task as any);
    return lines;
}

export function travelerTradeStatLines(trade: TravelerTradeOrderDesc): StatLine[] {
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")()!;
    const npcName = getTravelerNpcName(trade.traveler.tag);
    const lines: StatLine[] = [["Traveler:", npcName]];
    trade.levelRequirements.forEach(req => {
        const pair = skillReqPair(req, skillData);
        if (pair) lines.push(pair);
    });
    addKnowledgeRequirements(lines, trade as any);
    return lines;
}

// ─── Placeable Stat Line Extractors ─────────────────────────────

export function placementStatLines(placement: PlaceablePlacementDesc): StatLine[] {
    const lines: StatLine[] = [
        ["Time:", fixFloat(placement.requiredTime)],
    ];

    // Biome requirements
    if (placement.requiredBiomes.length) {
        const biomeOrdinals = BitCraftTables.PlaceablePlacementDesc.tagToOrdinal("requiredBiomes");
        const biomeIndex = BitCraftTables.BiomeDesc.indexedBy("biomeType");
        function tagToBiomeLink(tag: string) {
            const descId = biomeOrdinals.get(tag);
            const desc = biomeIndex().get(descId);
            return descId ? <BiomeLink biomeType={descId} name={desc?.name} showIcon={false}/> : tag;
        }
        lines.push([
            <IconSpan icon={pageIcon("Biomes")}>Biomes:</IconSpan>,
            <LinkedList>{placement.requiredBiomes.map((b: Biome) => tagToBiomeLink(b.tag))}</LinkedList>
        ]);
    }

    // Paving/Interior tier
    if (placement.requiredPavingTier > 0) {
        lines.push(["Paving Tier:", placement.requiredPavingTier]);
    }
    if (placement.requiredInteriorTier > 0) {
        lines.push(["Interior Tier:", placement.requiredInteriorTier]);
    }
    if (placement.requiredClaimTier > 0) {
        lines.push([<IconSpan icon={pageIcon("Claim Research")}>Claim Tier:</IconSpan>, placement.requiredClaimTier]);
    }

    // Level/tool/knowledge requirements
    const skillData = BitCraftTables.SkillDesc.indexedBy("id")()!;
    const toolData = BitCraftTables.ToolTypeDesc.indexedBy("id")()!;
    placement.levelRequirements.forEach(req => {
        const pair = skillReqPair(req, skillData);
        if (pair) lines.push(pair);
    });
    placement.toolRequirements.forEach(req => {
        const pair = toolReqPair(req, toolData);
        if (pair) lines.push(pair as StatLine);
    });
    addKnowledgeRequirements(lines, placement);

    // Distance constraints
    if (placement.minDistanceToPlayerClaims > 0) {
        lines.push([<IconSpan icon={pageIcon("Claim Research")}>Min Dist to Claims:</IconSpan>, placement.minDistanceToPlayerClaims]);
    }
    // Building proximity
    if (placement.buildings.length) {
        const buildingIndex = BitCraftTables.BuildingDesc.indexedBy("id")();
        const names = placement.buildings
            .map(id => buildingIndex?.get(id)?.name ?? `Building #${id}`)
            .join(", ");
        lines.push([<IconSpan icon={pageIcon("Structures")}>Near Building:</IconSpan>, `${names} (≤${placement.maxDistanceToBuildings}m)`]);
    }

    return lines;
}

export function interactionStatLines(interaction: PlaceableInteractionDesc): StatLine[] {
    const lines: StatLine[] = [
        ["Time:", fixFloat(interaction.timeRequirement)],
        ["Stamina:", fixFloat(interaction.staminaRequirement)],
    ];

    if (interaction.range > 1) {
        lines.push(["Range:", interaction.range]);
    }

    // Common requirements (level, xp, tool)
    addCommonRequirements(lines, interaction);
    addKnowledgeRequirements(lines, interaction);

    return lines;
}

export function growthStatLines(growth: PlaceableGrowthDesc): StatLine[] {
    const minTime = growth.time[0] ?? 0;
    const maxTime = growth.time[1] ?? minTime;
    const lines: StatLine[] = [
        ["Time:", `${fixFloat(minTime)}s – ${fixFloat(maxTime)}s`],
    ];
    if (!growth.showTimeLeft) {
        lines.push(["Shows Time Left:", "No"]);
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
