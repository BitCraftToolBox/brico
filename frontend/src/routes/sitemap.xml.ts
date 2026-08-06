import type {APIEvent} from "@solidjs/start/server";
import {getItemListSource} from "~/lib/relations";
import {BitCraftTables, preloadAllTablesServer} from "~/lib/spacetime";

/**
 * Every crawlable detail-page family: URL slug, the table it reads, the field whose value appears in
 * the URL (the same field the corresponding [id].tsx route indexes by), and an optional filter
 * dropping rows whose page isn't canonical.
 *
 * Deliberately absent: `tool`, `food`, `weapon`, and `equipment`. The item page renders a strict
 * superset of each of those (same stat groups, plus the item's own description, tag, and full
 * relationship tabs), so listing them added up to four near-duplicate, thinner URLs per equippable
 * or edible item — competing with the canonical item page for the same query and spending crawl
 * budget to do it. Those routes now redirect to `/database/item/{id}` anyway.
 */
const ENTITIES: {slug: string; table: keyof typeof BitCraftTables; idField: string; include?: (row: any) => boolean}[] = [
    {slug: "achievement", table: "AchievementDesc", idField: "id"},
    {slug: "biome", table: "BiomeDesc", idField: "biomeType"},
    {slug: "buff", table: "BuffDesc", idField: "id"},
    {slug: "building", table: "BuildingDesc", idField: "id"},
    {slug: "cargo", table: "CargoDesc", idField: "id"},
    {slug: "claim-research", table: "ClaimTechDesc", idField: "id"},
    {slug: "collectible", table: "CollectibleDesc", idField: "id"},
    {slug: "combat", table: "CombatActionDesc", idField: "id"},
    {slug: "creature", table: "EnemyDesc", idField: "enemyType"},
    {slug: "deployable", table: "DeployableDesc", idField: "id"},
    {slug: "item", table: "ItemDesc", idField: "id"},
    // Only lists with no resolvable owner: the rest canonicalize to the item or creature whose page
    // already renders their contents in full (see item-list/[id].tsx), so listing them here would
    // just ask Google to crawl URLs we've told it not to index.
    {slug: "item-list", table: "ItemListDesc", idField: "id", include: row => getItemListSource(row).type === "Unknown"},
    {slug: "knowledge", table: "SecondaryKnowledgeDesc", idField: "id"},
    {slug: "paving", table: "PavingTileDesc", idField: "id"},
    {slug: "placeable", table: "PlaceableDesc", idField: "id"},
    {slug: "prospecting", table: "ProspectingDesc", idField: "id"},
    {slug: "quest-chain", table: "QuestChainDesc", idField: "id"},
    {slug: "resource", table: "ResourceDesc", idField: "id"},
    {slug: "skill", table: "SkillDesc", idField: "id"},
    {slug: "terraforming", table: "TerraformRecipeDesc", idField: "difference"},
    {slug: "traveler-task", table: "TravelerTaskDesc", idField: "id"},
    {slug: "traveler-trade", table: "TravelerTradeOrderDesc", idField: "id"},
];

/**
 * Generated sitemap listing every detail-page URL directly, so crawlers discover them without
 * having to walk the giant list-page tables row by row. Self-preloads regardless of the caller's
 * UA — a human hitting /sitemap.xml or Search Console fetching it shouldn't depend on the bot
 * gate in middleware.ts. Comfortably under the 50,000-URL single-file limit.
 */
export async function GET(event: APIEvent) {
    await preloadAllTablesServer(new URL(event.request.url).origin);
    const urls = ENTITIES.flatMap(({slug, table, idField, include}) =>
        (BitCraftTables[table].get() ?? [])
            .filter((row: any) => include?.(row) ?? true)
            .map((row: any) =>
                `<url><loc>https://brico.app/database/${slug}/${row[idField]}</loc></url>`));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
    return new Response(xml, {headers: {"Content-Type": "application/xml"}});
}
