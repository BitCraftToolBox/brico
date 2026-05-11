/**
 * Global Search — Searches across all major game data tables.
 *
 * Each searchable table declares:
 *   - label: Display name for the group
 *   - route: URL path prefix for detail pages
 *   - tableKey: Key in BitCraftTables
 *   - pk: Primary key property name
 *   - name: Display name property accessor
 *   - fields: Additional searchable fields
 *
 * Uses scoring from cereal's search implementation (adapted).
 */

import {getTravelerTradeName} from "~/lib/relations";
import {BitCraftTables} from "~/lib/spacetime";

// ─── Types ──────────────────────────────────────────────────────

export interface SearchableTable {
    label: string;
    route: string;
    tableKey: keyof typeof BitCraftTables;
    pk: string;
    name: (row: any) => string;
    fields?: { field: string; get: (row: any) => string | undefined }[];
}

export interface ObjectMatch {
    tableName: string;
    label: string;
    route: string;
    primaryKey: string | number;
    displayName: string;
    matchField: string;
    matchValue: string;
    score: number;
}

export interface GroupedResults {
    groups: Map<string, { label: string; matches: ObjectMatch[]; total: number }>;
    totalMatches: number;
}

// ─── Searchable Table Declarations ──────────────────────────────

export const searchableTables: SearchableTable[] = [
    {
        label: "Items", route: "/database/item", tableKey: "ItemDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
    },
    {
        label: "Cargo", route: "/database/cargo", tableKey: "CargoDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Creatures", route: "/database/creature", tableKey: "EnemyDesc",
        pk: "enemyType", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Resources", route: "/database/resource", tableKey: "ResourceDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Structures", route: "/database/building", tableKey: "BuildingDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Collectibles", route: "/database/collectible", tableKey: "CollectibleDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Deployables", route: "/database/deployable", tableKey: "DeployableDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Traveler Tasks", route: "/database/traveler-task", tableKey: "TravelerTaskDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Traveler Trades", route: "/database/traveler-trade", tableKey: "TravelerTradeOrderDesc",
        pk: "id", name: (r) => getTravelerTradeName(r),
    },
    {
        label: "Claim Research", route: "/database/claim-research", tableKey: "ClaimTechDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Biomes", route: "/database/biome", tableKey: "BiomeDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Item Lists", route: "/database/item-list", tableKey: "ItemListDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Weapons", route: "/database/weapon", tableKey: "WeaponDesc",
        pk: "itemId", name: (r) => {
            const item = BitCraftTables.ItemDesc.indexedBy("id")()?.get(r.itemId);
            return item?.name ?? `Weapon ${r.itemId}`;
        },
    },
    {
        label: "Achievements", route: "/database/achievement", tableKey: "AchievementDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Prospecting", route: "/database/prospecting", tableKey: "ProspectingDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Combat Abilities", route: "/database/combat", tableKey: "CombatActionDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Paving", route: "/database/paving", tableKey: "PavingTileDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Food", route: "/database/food", tableKey: "FoodDesc",
        pk: "itemId", name: (r) => {
            const item = BitCraftTables.ItemDesc.indexedBy("id")()?.get(r.itemId);
            return item?.name ?? `Food ${r.itemId}`;
        },
    },
    {
        label: "Tools", route: "/database/tool", tableKey: "ToolDesc",
        pk: "itemId", name: (r) => {
            const item = BitCraftTables.ItemDesc.indexedBy("id")()?.get(r.itemId);
            return item?.name ?? `Tool ${r.itemId}`;
        },
    },
    {
        label: "Equipment", route: "/database/equipment", tableKey: "EquipmentDesc",
        pk: "itemId", name: (r) => {
            const item = BitCraftTables.ItemDesc.indexedBy("id")()?.get(r.itemId);
            return item?.name ?? `Equipment ${r.itemId}`;
        },
    },
    {
        label: "Buffs", route: "/database/buff", tableKey: "BuffDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Knowledge", route: "/database/knowledge", tableKey: "SecondaryKnowledgeDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Skills", route: "/database/skill", tableKey: "SkillDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Quest Chains", route: "/database/quest-chain", tableKey: "QuestChainDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Placeables", route: "/database/placeable", tableKey: "PlaceableDesc",
        pk: "id", name: (r) => r.name,
    },
];

// ─── Scoring (adapted from cereal) ──────────────────────────────

function normalize(s: string): string {
    return s.replace(/[\s_\-.'"]+/g, "").toLowerCase();
}

function scoreWord(target: string, word: string): number | null {
    if (target === word) return 0;

    const isSingleToken = !/[\s]/.test(target);
    if (isSingleToken) {
        if (target.startsWith(word)) return 1;
        if (target.includes(word)) return 2;
    }

    const nt = normalize(target);
    const nw = normalize(word);
    if (nw.length >= 3) {
        if (nt === nw) return 0.5;
        if (nt.startsWith(nw)) return 1.5;
    }

    const targetWords = target.split(/[\s_\-.'"]+/).filter(Boolean);
    let best: number | null = null;
    const improve = (s: number) => {
        if (best === null || s < best) best = s;
    };

    for (const tw of targetWords) {
        if (tw === word) {
            improve(3);
            continue;
        }
        if (tw.startsWith(word)) {
            improve(3.5);
            continue;
        }
        if (tw.includes(word)) {
            improve(4);

        }
    }

    return best;
}

export function scoreMatch(target: string, query: string): number | null {
    const t = target.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return null;

    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    const nt = normalize(t);
    const nq = normalize(q);
    if (nq.length >= 3) {
        if (nt === nq) return 0.5;
        if (nt.startsWith(nq)) return 1.5;
    }

    const words = q.split(/[\s_]+/).filter(Boolean);
    if (words.length > 1) {
        let total = 0;
        for (const word of words) {
            const s = scoreWord(t, word);
            if (s === null) return null;
            total += s;
        }
        return total;
    }

    return scoreWord(t, q);
}

// ─── Search Function ────────────────────────────────────────────

export function globalSearch(
    query: string,
    maxPerTable = 10,
    scoreCutoff = 7,
): GroupedResults {
    const q = query.trim();
    const groups = new Map<string, { label: string; matches: ObjectMatch[]; total: number }>();
    let totalMatches = 0;

    if (!q) return {groups, totalMatches};

    for (const table of searchableTables) {
        const data = BitCraftTables[table.tableKey].get();
        if (!data) continue;

        const matches: ObjectMatch[] = [];

        for (const row of data) {
            const pk = (row as any)[table.pk];
            const displayName = table.name(row);

            let bestScore: number | null = null;
            let bestField = "name";
            let bestVal = displayName;

            // Check PK exact match
            if (String(pk).toLowerCase() === q.toLowerCase()) {
                bestScore = -1;
                bestField = "id";
                bestVal = String(pk);
            }

            // Check display name
            if (displayName && (bestScore === null || bestScore > 0)) {
                const nameScore = scoreMatch(displayName, q);
                if (nameScore !== null && nameScore <= scoreCutoff && (bestScore === null || nameScore < bestScore)) {
                    bestScore = nameScore;
                    bestField = "name";
                    bestVal = displayName;
                }
            }

            // Check additional fields
            if (table.fields) {
                for (const f of table.fields) {
                    const val = f.get(row);
                    if (!val) continue;
                    const fieldScore = scoreMatch(val, q);
                    if (fieldScore !== null && fieldScore <= scoreCutoff && (bestScore === null || fieldScore < bestScore)) {
                        bestScore = fieldScore;
                        bestField = f.field;
                        bestVal = val;
                    }
                }
            }

            if (bestScore !== null) {
                matches.push({
                    tableName: table.tableKey,
                    label: table.label,
                    route: `${table.route}/${pk}`,
                    primaryKey: pk,
                    displayName,
                    matchField: bestField,
                    matchValue: bestVal,
                    score: bestScore,
                });
            }
        }

        if (matches.length > 0) {
            matches.sort((a, b) => a.score - b.score);
            totalMatches += matches.length;
            groups.set(table.tableKey, {
                label: table.label,
                matches: matches.slice(0, maxPerTable),
                total: matches.length,
            });
        }
    }

    // Sort groups by best match score
    const sorted = new Map(
        [...groups.entries()].sort((a, b) => a[1].matches[0].score - b[1].matches[0].score)
    );

    return {groups: sorted, totalMatches};
}

/**
 * Quick search for dropdown suggestions — fewer results, stricter cutoff.
 */
export function quickSearch(query: string, maxResults = 15): ObjectMatch[] {
    const result = globalSearch(query, 5, 4);
    const all: ObjectMatch[] = [];
    for (const group of result.groups.values()) {
        all.push(...group.matches);
    }
    all.sort((a, b) => a.score - b.score);
    return all.slice(0, maxResults);
}
