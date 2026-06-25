/**
 * Global Search — searchable table declarations and Fuse.js-powered search helpers.
 */

import Fuse, {FuseResult, IFuseOptions} from "fuse.js";
import {getTravelerTaskName, getTravelerTradeName} from "~/lib/relations";
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

export interface GlobalSearchIndex {
    fuse: Fuse<SearchDocument>;
    metadataByTableName: Map<string, SearchDocumentMeta>;
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
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
    },
    {
        label: "Creatures", route: "/database/creature", tableKey: "EnemyDesc",
        pk: "enemyType", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
    },
    {
        label: "Resources", route: "/database/resource", tableKey: "ResourceDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "tag", get: (r) => r.tag}]
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
        fields: [{field: "type", get: (r) => r.deployableType.tag}],
    },
    {
        label: "Traveler Tasks", route: "/database/traveler-task", tableKey: "TravelerTaskDesc",
        pk: "id", name: (r) => getTravelerTaskName(r),
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
        pk: "biomeType", name: (r) => r.name,
    },
    {
        label: "Item Lists", route: "/database/item-list", tableKey: "ItemListDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        label: "Achievements", route: "/database/achievement", tableKey: "AchievementDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Prospecting", route: "/database/prospecting", tableKey: "ProspectingDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Combat Abilities", route: "/database/combat", tableKey: "CombatActionDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        label: "Paving", route: "/database/paving", tableKey: "PavingTileDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
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

interface SearchDocument {
    id: string;
    tableName: string;
    primaryKey: string | number;
    name: string;
    fields: Record<string, string>;
}

interface SearchDocumentMeta {
    label: string;
    routePrefix: string;
}

const PK_MIN = 0;
const PK_MAX = 2147483647;
const FALLBACK_FIELD = "name";
const FALLBACK_SCORE = 1;

const searchableFieldNames = [...new Set(
    searchableTables.flatMap((table) => table.fields?.map((field) => field.field) ?? [])
)];
const fuseKeys: IFuseOptions<SearchDocument>["keys"] = [
    {name: "name", weight: 3},
    ...searchableFieldNames.map((fieldName) => ({name: `fields.${fieldName}`, weight: 1})),
];

const fuseOptions: IFuseOptions<SearchDocument> = {
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true,
    threshold: 0.2,
    minMatchCharLength: 2,
    keys: fuseKeys,
};

function isValidPK(value: number): boolean {
    return Number.isInteger(value) && value >= PK_MIN && value <= PK_MAX;
}

function parseNumberAsPK(query: string): number | null {
    if (!/^\d+$/.test(query)) return null;
    const value = Number(query);
    return isValidPK(value) ? value : null;
}

function buildDocId(tableName: string, primaryKey: string | number): string {
    return `${tableName}:${primaryKey}`;
}

function resolveMatchField(result: FuseResult<SearchDocument>): { matchField: string; matchValue: string } {
    const matches = result.matches;
    if (!matches || matches.length === 0) {
        return {matchField: FALLBACK_FIELD, matchValue: result.item.name};
    }

    const bestMatch = matches.reduce((best, current) => {
        const bestSpan = best.indices.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
        const currentSpan = current.indices.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
        return currentSpan > bestSpan ? current : best;
    });

    const key = typeof bestMatch.key === "string" ? bestMatch.key : "";
    if (key === "name") {
        return {matchField: "name", matchValue: result.item.name};
    }

    if (key.startsWith("fields.")) {
        const fieldName = key.slice("fields.".length);
        return {
            matchField: fieldName,
            matchValue: result.item.fields[fieldName] ?? "",
        };
    }

    return {matchField: FALLBACK_FIELD, matchValue: result.item.name};
}

function collectPkExactMatches(query: string): ObjectMatch[] {
    const parsed = parseNumberAsPK(query);
    if (parsed === null) return [];

    const matches: ObjectMatch[] = [];
    for (const table of searchableTables) {
        // @ts-ignore
        const idx = BitCraftTables[table.tableKey].indexedBy(table.pk);
        const row = idx().get(parsed);
        if (!row) continue;

        const primaryKey = (row as any)[table.pk] as string | number;
        const displayName = table.name(row);
        matches.push({
            tableName: table.tableKey,
            label: table.label,
            route: `${table.route}/${primaryKey}`,
            primaryKey,
            displayName,
            matchField: "id",
            matchValue: String(primaryKey),
            score: -1,
        });
    }

    return matches;
}

export function createGlobalSearchIndex(): GlobalSearchIndex {
    console.log("Creating global search index...");
    const documents: SearchDocument[] = [];
    const metadataByTableName = new Map<string, SearchDocumentMeta>();

    for (const table of searchableTables) {
        metadataByTableName.set(table.tableKey, {
            label: table.label,
            routePrefix: table.route,
        });

        const data = BitCraftTables[table.tableKey].get();
        if (!data) continue;

        for (const row of data) {
            const primaryKey = (row as any)[table.pk] as string | number | undefined;
            if (primaryKey === undefined || primaryKey === null) continue;

            const name = table.name(row);
            const fields: Record<string, string> = {};
            for (const field of table.fields ?? []) {
                const value = field.get(row);
                if (value) fields[field.field] = value;
            }

            const id = buildDocId(table.tableKey, primaryKey);
            documents.push({
                id,
                tableName: table.tableKey,
                primaryKey,
                name,
                fields,
            });
        }
    }

    const fuseIndex = Fuse.createIndex<SearchDocument>(fuseKeys ?? [], documents);
    return {
        fuse: new Fuse(documents, fuseOptions, fuseIndex),
        metadataByTableName,
    };
}

export function globalSearch(
    index: GlobalSearchIndex | null,
    query: string,
    maxPerTable = 10,
    scoreCutoff = 0.2,
): GroupedResults {
    const q = query.trim();
    const groups = new Map<string, { label: string; matches: ObjectMatch[]; total: number }>();
    let totalMatches = 0;

    if (!q || !index) return {groups, totalMatches};

    const matchByDocId = new Map<string, ObjectMatch>();
    for (const exact of collectPkExactMatches(q)) {
        matchByDocId.set(buildDocId(exact.tableName, exact.primaryKey), exact);
    }

    const fuzzyMatches = index.fuse.search(q);
    for (const result of fuzzyMatches) {
        const score = result.score ?? FALLBACK_SCORE;
        if (score > scoreCutoff) continue;

        const metadata = index.metadataByTableName.get(result.item.tableName);
        if (!metadata) continue;

        const existing = matchByDocId.get(result.item.id);
        if (existing && existing.score <= score) continue;

        const {matchField, matchValue} = resolveMatchField(result);
        matchByDocId.set(result.item.id, {
            tableName: result.item.tableName,
            label: metadata.label,
            route: `${metadata.routePrefix}/${result.item.primaryKey}`,
            primaryKey: result.item.primaryKey,
            displayName: result.item.name,
            matchField,
            matchValue,
            score,
        });
    }

    const groupedMatches = new Map<string, { label: string; matches: ObjectMatch[] }>();
    for (const match of matchByDocId.values()) {
        const existing = groupedMatches.get(match.tableName);
        if (existing) {
            existing.matches.push(match);
        } else {
            groupedMatches.set(match.tableName, {label: match.label, matches: [match]});
        }
    }

    for (const [tableName, grouped] of groupedMatches) {
        grouped.matches.sort((a, b) => a.score - b.score);
        totalMatches += grouped.matches.length;
        groups.set(tableName, {
            label: grouped.label,
            matches: grouped.matches.slice(0, maxPerTable),
            total: grouped.matches.length,
        });
    }

    const sorted = new Map(
        [...groups.entries()].sort((a, b) => a[1].matches[0].score - b[1].matches[0].score)
    );

    return {groups: sorted, totalMatches};
}

export function quickSearch(index: GlobalSearchIndex | null, query: string, maxResults = 15): ObjectMatch[] {
    const result = globalSearch(index, query, 5, 0.1);
    const all: ObjectMatch[] = [];
    for (const group of result.groups.values()) {
        all.push(...group.matches);
    }
    all.sort((a, b) => a.score - b.score);
    return all.slice(0, maxResults);
}
