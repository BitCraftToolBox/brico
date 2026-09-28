/** skills.ts — skill id → display name index, read from offline BSATN game data. */
import {SkillDesc} from "@brico/bitcraft-bindings/types";

import {loadGameDataTable} from "./load.ts";

/** `RecipeStatic.skillId` → that skill's display name. */
export type SkillNameIndex = ReadonlyMap<number, string>;

export async function loadSkillNameIndex(gameDataDir: string): Promise<SkillNameIndex> {
    const rows = await loadGameDataTable<SkillDesc>(gameDataDir, "skill_desc", SkillDesc.algebraicType);
    return new Map(rows.map(skill => [skill.id, skill.name]));
}
