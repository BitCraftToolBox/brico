/**
 * Progression — Data layer for skill-level unlocks shown on the skill detail page.
 *
 * Collects everything that unlocks at a given level of a given skill across the handful of tables
 * that carry a `showInProgression` flag plus a `levelRequirements`-shaped field, and returns them as
 * a flat, level-tagged, tagged-union array. Display logic (labels, links) lives elsewhere — see the
 * Progression tab on `routes/database/skill/[id].tsx`.
 */

import {AbilityCustomDesc} from "~/bindings/src/ability_custom_desc_type";
import {AbilityUnlockDesc} from "~/bindings/src/ability_unlock_desc_type";
import {AchievementDesc} from "~/bindings/src/achievement_desc_type";
import {CraftingRecipeDesc} from "~/bindings/src/crafting_recipe_desc_type";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {EquipmentDesc} from "~/bindings/src/equipment_desc_type";
import {ExtractionRecipeDesc} from "~/bindings/src/extraction_recipe_desc_type";
import {ProspectingDesc} from "~/bindings/src/prospecting_desc_type";
import {QuestChainDesc} from "~/bindings/src/quest_chain_desc_type";
import {TravelerTradeOrderDesc} from "~/bindings/src/traveler_trade_order_desc_type";
import {BitCraftTables} from "~/lib/spacetime";

// changes here need to be mirrored to PROGRESSION_CATEGORIES in src/routes/database/skill/[id].tsx
export type ProgressionUnlock =
    | { kind: "crafting"; level: number; recipe: CraftingRecipeDesc }
    | { kind: "equipment"; level: number; equipment: EquipmentDesc }
    | { kind: "resource"; level: number; recipe: ExtractionRecipeDesc }
    | { kind: "prospecting"; level: number; unlock: AbilityUnlockDesc; prospecting: ProspectingDesc }
    | { kind: "ability"; level: number; unlock: AbilityUnlockDesc; ability: AbilityCustomDesc }
    | { kind: "stat"; level: number; stat: CsvStatEntry }
    | { kind: "quest"; level: number; quest: QuestChainDesc }
    | { kind: "achievement"; level: number; achievement: AchievementDesc }
    | { kind: "travelerTrade"; level: number; trade: TravelerTradeOrderDesc }
    ;

const AOC_ID: number = 12345; // Art of Cheating knowledge ID

/** Every unlock across all progression sources whose first level requirement matches this skill. */
export function progressionUnlocksForSkill(skillId: number): ProgressionUnlock[] {
    const unlocks: ProgressionUnlock[] = [];

    for (const recipe of BitCraftTables.CraftingRecipeDesc.get() ?? []) {
        if (!recipe.showInProgression) continue;
        const req = recipe.levelRequirements[0];
        if (req?.skillId === skillId) unlocks.push({kind: "crafting", level: req.level, recipe});
    }

    for (const equipment of BitCraftTables.EquipmentDesc.get() ?? []) {
        if (!equipment.showInProgression) continue;
        const req = equipment.levelRequirement;
        if (req?.skillId === skillId) unlocks.push({kind: "equipment", level: req.level, equipment});
    }

    for (const recipe of BitCraftTables.ExtractionRecipeDesc.get() ?? []) {
        if (!recipe.showInProgression) continue;
        const req = recipe.levelRequirements[0];
        if (req?.skillId === skillId) unlocks.push({kind: "resource", level: req.level, recipe});
    }

    const abilityIndex = BitCraftTables.AbilityCustomDesc.indexedBy("id")();
    const prospectingIndex = BitCraftTables.ProspectingDesc.indexedBy("id")();
    for (const unlock of BitCraftTables.AbilityUnlockDesc.get() ?? []) {
        if (!unlock.showInProgression || !unlock.abilityData) continue;
        const req = unlock.levelRequirements[0];
        if (req?.skillId !== skillId) continue;
        if (unlock.abilityData.tag === "Custom") {
            const ability = abilityIndex.get(unlock.abilityData.value);
            if (ability) unlocks.push({kind: "ability", level: req.level, unlock, ability});
        } else if (unlock.abilityData.tag === "Prospecting") {
            const prospecting = prospectingIndex.get(unlock.abilityData.value);
            if (prospecting) unlocks.push({kind: "prospecting", level: req.level, unlock, prospecting});
        }
    }

    for (const quest of BitCraftTables.QuestChainDesc.get() ?? []) {
        const req = quest.requirements.find(r => r.tag === "Level" && r.value.skillId === skillId);
        if (req?.tag === "Level") unlocks.push({kind: "quest", level: req.value.level, quest});
    }

    for (const achievement of BitCraftTables.AchievementDesc.get() ?? []) {
        if (achievement.skillId === skillId) unlocks.push({kind: "achievement", level: achievement.skillLevel, achievement});
    }

    for (const trade of BitCraftTables.TravelerTradeOrderDesc.get() ?? []) {
        if (trade.requiredKnowledges.includes(AOC_ID)) continue;
        const req = trade.levelRequirements[0];
        if (req?.skillId === skillId) unlocks.push({kind: "travelerTrade", level: req.level, trade});
    }

    const knowledgeStats = BitCraftTables.KnowledgeStatModifierDesc.indexedBy("secondaryKnowledgeId")();
    for (const skillKnowledge of BitCraftTables.SkillLevelKnowledgeDesc.get() ?? []) {
        if (skillKnowledge.skillId !== skillId) continue;
        const stats = knowledgeStats.get(skillKnowledge.secondaryKnowledgeId)?.stats ?? [];
        for (const stat of stats) {
            unlocks.push({kind: "stat", level: skillKnowledge.level, stat});
        }
    }

    return unlocks;
}
