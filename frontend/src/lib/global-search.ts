/**
 * Global Search — searchable table declarations and Fuse.js-powered search helpers.
 */

import type {Rarity} from "@brico/bitcraft-bindings/types";
import Fuse, {FuseResult, IFuseOptions} from "fuse.js";
import {BitCraftTables} from "~/lib/bitcraft-data";
import {parseChatLink, resolveChatLink} from "~/lib/chat-links";
import {sourceRow} from "~/lib/data-translation";
import {deployableTypeLabel} from "~/lib/game-strings.ts";
import {type Label} from "~/lib/labels";
import {getTravelerTaskName, getTravelerTradeName} from "~/lib/relations";
import {PAGE_TITLE_LABELS, type SidebarHrefs} from "~/lib/sidebar-items";
import {getBuildingTier} from "./bitcraft-utils";

// ─── Types ──────────────────────────────────────────────────────

export interface SearchableTable {
    /** Sidebar href; the group label is the sidebar entry's `titleLabel`. */
    route: SidebarHrefs;
    tableKey: keyof typeof BitCraftTables;
    pk: string;
    name: (row: any) => string;
    fields?: { field: string; get: (row: any) => string | undefined }[];
    tier?: (row: any) => number | undefined;
    rarity?: (row: any) => Rarity | undefined;
}

export interface ObjectMatch {
    tableName: string;
    label: Label;
    route: string;
    primaryKey: string | number;
    displayName: string;
    matchField: string;
    matchValue: string;
    score: number;
    tier?: number;
    rarity?: Rarity;
}

export interface GroupedResults {
    groups: Map<string, { label: Label; matches: ObjectMatch[]; total: number }>;
    totalMatches: number;
}

export interface GlobalSearchIndex {
    fuse: Fuse<SearchDocument>;
    metadataByTableName: Map<string, SearchDocumentMeta>;
    documents: SearchDocument[];
}

// ─── Searchable Table Declarations ──────────────────────────────

export const searchableTables: SearchableTable[] = [
    {
        route: "/database/item", tableKey: "ItemDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
        tier: (r) => r.tier,
        rarity: (r) => r.rarity,
    },
    {
        route: "/database/cargo", tableKey: "CargoDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
        tier: (r) => r.tier,
        rarity: (r) => r.rarity,
    },
    {
        route: "/database/creature", tableKey: "EnemyDesc",
        pk: "enemyType", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}, {field: "tag", get: (r) => r.tag}],
        tier: (r) => r.tier,
        rarity: (r) => r.rarity,
    },
    {
        route: "/database/resource", tableKey: "ResourceDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "tag", get: (r) => r.tag}],
        tier: (r) => r.tier,
        rarity: (r) => r.rarity,
    },
    {
        route: "/database/building", tableKey: "BuildingDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
        tier: (r) => getBuildingTier(r),
    },
    {
        route: "/database/collectible", tableKey: "CollectibleDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
        rarity: (r) => r.collectibleRarity,
    },
    {
        route: "/database/deployable", tableKey: "DeployableDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "type", get: (r) => deployableTypeLabel(r.deployableType.tag)}],
    },
    {
        route: "/database/traveler-task", tableKey: "TravelerTaskDesc",
        pk: "id", name: (r) => getTravelerTaskName(r),
    },
    {
        route: "/database/traveler-trade", tableKey: "TravelerTradeOrderDesc",
        pk: "id", name: (r) => getTravelerTradeName(r),
    },
    {
        route: "/database/claim-research", tableKey: "ClaimTechDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
        tier: (r) => r.tier,
    },
    {
        route: "/database/biome", tableKey: "BiomeDesc",
        pk: "biomeType", name: (r) => r.name,
    },
    {
        route: "/database/item-list", tableKey: "ItemListDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        route: "/database/achievement", tableKey: "AchievementDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/prospecting", tableKey: "ProspectingDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/premium-item", tableKey: "PremiumItemDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/combat", tableKey: "CombatActionDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/paving", tableKey: "PavingTileDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
        tier: (r) => r.tier,
    },
    {
        route: "/database/pillar-shaping", tableKey: "PillarShapingDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
        tier: (r) => r.tier,
    },
    {
        route: "/database/ability", tableKey: "AbilityCustomDesc",
        pk: "id", name: (r) => r.abilityName,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/buff", tableKey: "BuffDesc",
        pk: "id", name: (r) => r.description,
        fields: [{field: "description", get: (r) => BitCraftTables.BuffTypeDesc.indexedBy("id")().get(r.buffTypeId)?.name}],
    },
    {
        route: "/database/knowledge", tableKey: "SecondaryKnowledgeDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        route: "/database/skill", tableKey: "SkillDesc",
        pk: "id", name: (r) => r.name,
        fields: [{field: "description", get: (r) => r.description}],
    },
    {
        route: "/database/quest-chain", tableKey: "QuestChainDesc",
        pk: "id", name: (r) => r.name,
    },
    {
        route: "/database/placeable", tableKey: "PlaceableDesc",
        pk: "id", name: (r) => r.name,
        tier: (r) => r.tier,
        rarity: (r) => r.rarity,
    },
];

interface SearchDocument {
    id: string;
    tableName: string;
    primaryKey: string | number;
    name: string;
    fields: Record<string, string>;
    /** English text, present only where it differs from the displayed (translated) text. */
    sourceName?: string;
    sourceFields?: Record<string, string>;
    tier?: number;
    rarity?: Rarity;
}

interface SearchDocumentMeta {
    label: Label;
    routePrefix: string;
}

const PK_MIN = 0;
const PK_MAX = 2147483647;
const FALLBACK_FIELD = "name";
const FALLBACK_SCORE = 1;
const TIER_MIN = -1;
const TIER_MAX = 10;
const TIER_EXACT_SCORE = 0;

// Matches a standalone "t6"/"t-1" token, a "tier 6" phrase, or the "untiered" alias for t-1.
const TIER_TOKEN_RE = /\bt(-?\d{1,2})\b|\btier\s+(-?\d{1,2})\b|\buntiered\b/i;

function formatTier(tier: number): string {
    return tier === -1 ? "untiered" : `T${tier}`;
}

function extractTierFilter(query: string): { tier: number | undefined; remainder: string } {
    const match = TIER_TOKEN_RE.exec(query);
    if (!match) return {tier: undefined, remainder: query};

    const tierToken = match[1] ?? match[2];
    const tier = tierToken !== undefined ? parseInt(tierToken, 10) : -1; // unmatched group pair means "untiered"

    if (Number.isNaN(tier) || tier < TIER_MIN || tier > TIER_MAX) {
        return {tier: undefined, remainder: query};
    }

    const remainder = (query.slice(0, match.index) + query.slice(match.index + match[0].length))
        .replace(/\s+/g, " ")
        .trim();

    return {tier, remainder};
}

const searchableFieldNames = [...new Set(
    searchableTables.flatMap((table) => table.fields?.map((field) => field.field) ?? [])
)];
const SOURCE_SUFFIX = " (en)";
const fuseKeys: IFuseOptions<SearchDocument>["keys"] = [
    {name: "name", weight: 3},
    {name: "sourceName", weight: 2.5},
    ...searchableFieldNames.map((fieldName) => ({name: `fields.${fieldName}`, weight: 1})),
    ...searchableFieldNames.map((fieldName) => ({name: `sourceFields.${fieldName}`, weight: 0.9})),
];

const fuseOptions: IFuseOptions<SearchDocument> = {
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: true,
    threshold: 0.2,
    minMatchCharLength: 1,
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

    if (key === "sourceName") {
        return {matchField: `name${SOURCE_SUFFIX}`, matchValue: result.item.sourceName ?? ""};
    }

    if (key.startsWith("fields.")) {
        const fieldName = key.slice("fields.".length);
        return {
            matchField: fieldName,
            matchValue: result.item.fields[fieldName] ?? "",
        };
    }

    if (key.startsWith("sourceFields.")) {
        const fieldName = key.slice("sourceFields.".length);
        return {
            matchField: `${fieldName}${SOURCE_SUFFIX}`,
            matchValue: result.item.sourceFields?.[fieldName] ?? "",
        };
    }

    return {matchField: FALLBACK_FIELD, matchValue: result.item.name};
}

function exactMatch(table: SearchableTable, row: any): ObjectMatch {
    const primaryKey = row[table.pk] as string | number;
    return {
        tableName: table.tableKey,
        label: PAGE_TITLE_LABELS[table.route],
        route: `${table.route}/${primaryKey}`,
        primaryKey,
        displayName: table.name(row),
        matchField: "id",
        matchValue: String(primaryKey),
        score: -1,
        tier: table.tier?.(row),
        rarity: table.rarity?.(row),
    };
}

function lookupByPk(table: SearchableTable, pk: number): any {
    // @ts-ignore
    return BitCraftTables[table.tableKey].indexedBy(table.pk)().get(pk);
}

function collectPkExactMatches(query: string): ObjectMatch[] {
    const parsed = parseNumberAsPK(query);
    if (parsed === null) return [];

    const matches: ObjectMatch[] = [];
    for (const table of searchableTables) {
        const row = lookupByPk(table, parsed);
        if (row) matches.push(exactMatch(table, row));
    }

    return matches;
}

/** An in-game chat link like `(item=123)` matches the single page it points at. */
function collectChatLinkMatches(query: string): ObjectMatch[] {
    const link = parseChatLink(query);
    const target = link && resolveChatLink(link);
    if (!target) return [];

    const table = searchableTables.find((t) => t.route === target.route);
    const row = table && lookupByPk(table, target.pk);
    return table && row ? [exactMatch(table, row)] : [];
}

export function createGlobalSearchIndex(): GlobalSearchIndex {
    const documents: SearchDocument[] = [];
    const metadataByTableName = new Map<string, SearchDocumentMeta>();

    for (const table of searchableTables) {
        metadataByTableName.set(table.tableKey, {
            label: PAGE_TITLE_LABELS[table.route],
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

            // Translated rows carry their English original; index it too so English queries
            // keep working under a non-English data locale.
            const source = sourceRow(row);
            let sourceName: string | undefined;
            let sourceFields: Record<string, string> | undefined;
            if (source !== row) {
                const englishName = table.name(source);
                if (englishName && englishName !== name) sourceName = englishName;
                for (const field of table.fields ?? []) {
                    const value = field.get(source);
                    if (value && value !== fields[field.field]) {
                        (sourceFields ??= {})[field.field] = value;
                    }
                }
            }

            const id = buildDocId(table.tableKey, primaryKey);
            documents.push({
                id,
                tableName: table.tableKey,
                primaryKey,
                name,
                fields,
                sourceName,
                sourceFields,
                tier: table.tier?.(row),
                rarity: table.rarity?.(row),
            });
        }
    }

    const fuseIndex = Fuse.createIndex<SearchDocument>(fuseKeys ?? [], documents);
    return {
        fuse: new Fuse(documents, fuseOptions, fuseIndex),
        metadataByTableName,
        documents,
    };
}

export function globalSearch(
    index: GlobalSearchIndex | null,
    query: string,
    maxPerTable = 10,
    scoreCutoff = 0.2,
): GroupedResults {
    const q = query.trim();
    const groups = new Map<string, { label: Label; matches: ObjectMatch[]; total: number }>();
    let totalMatches = 0;

    if (!q || !index) return {groups, totalMatches};

    const matchByDocId = new Map<string, ObjectMatch>();
    for (const exact of [...collectPkExactMatches(q), ...collectChatLinkMatches(q)]) {
        matchByDocId.set(buildDocId(exact.tableName, exact.primaryKey), exact);
    }

    // Tier is pulled out of the query text and matched by exact equality on a
    // dedicated (non-fuzzy) field — Fuse can't cross-match a tier token against
    // one field and free text against another, so this can't be done in-index.
    const {tier, remainder} = extractTierFilter(q);

    if (tier !== undefined && !remainder) {
        for (const doc of index.documents) {
            if (doc.tier !== tier) continue;

            const metadata = index.metadataByTableName.get(doc.tableName);
            if (!metadata) continue;

            const existing = matchByDocId.get(doc.id);
            if (existing && existing.score <= TIER_EXACT_SCORE) continue;

            matchByDocId.set(doc.id, {
                tableName: doc.tableName,
                label: metadata.label,
                route: `${metadata.routePrefix}/${doc.primaryKey}`,
                primaryKey: doc.primaryKey,
                displayName: doc.name,
                matchField: "tier",
                matchValue: formatTier(tier),
                score: TIER_EXACT_SCORE,
                tier: doc.tier,
                rarity: doc.rarity,
            });
        }
    } else {
        const fuzzyMatches = index.fuse.search(tier !== undefined ? remainder : q);
        for (const result of fuzzyMatches) {
            if (tier !== undefined && result.item.tier !== tier) continue;

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
                tier: result.item.tier,
                rarity: result.item.rarity,
            });
        }
    }

    const groupedMatches = new Map<string, { label: Label; matches: ObjectMatch[] }>();
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
