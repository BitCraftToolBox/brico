import type {APIEvent} from "@solidjs/start/server";
import {BitCraftTables, preloadAllTablesServer} from "~/lib/spacetime";

/**
 * Every crawlable detail-page family: URL slug, the table it reads, and the field whose value
 * appears in the URL (the same field the corresponding [id].tsx route indexes by).
 */
const ENTITIES: {slug: string; table: keyof typeof BitCraftTables; idField: string}[] = [
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
    {slug: "equipment", table: "EquipmentDesc", idField: "itemId"},
    {slug: "food", table: "FoodDesc", idField: "itemId"},
    {slug: "item", table: "ItemDesc", idField: "id"},
    {slug: "item-list", table: "ItemListDesc", idField: "id"},
    {slug: "knowledge", table: "SecondaryKnowledgeDesc", idField: "id"},
    {slug: "paving", table: "PavingTileDesc", idField: "id"},
    {slug: "placeable", table: "PlaceableDesc", idField: "id"},
    {slug: "prospecting", table: "ProspectingDesc", idField: "id"},
    {slug: "quest-chain", table: "QuestChainDesc", idField: "id"},
    {slug: "resource", table: "ResourceDesc", idField: "id"},
    {slug: "skill", table: "SkillDesc", idField: "id"},
    {slug: "terraforming", table: "TerraformRecipeDesc", idField: "difference"},
    {slug: "tool", table: "ToolDesc", idField: "itemId"},
    {slug: "traveler-task", table: "TravelerTaskDesc", idField: "id"},
    {slug: "traveler-trade", table: "TravelerTradeOrderDesc", idField: "id"},
    {slug: "weapon", table: "WeaponDesc", idField: "itemId"},
];

/**
 * Generated sitemap listing every detail-page URL directly, so crawlers discover them without
 * having to walk the giant list-page tables row by row. Self-preloads regardless of the caller's
 * UA — a human hitting /sitemap.xml or Search Console fetching it shouldn't depend on the bot
 * gate in middleware.ts. ~20.6k URLs fits well under the 50,000-URL single-file limit.
 */
export async function GET(event: APIEvent) {
    await preloadAllTablesServer(new URL(event.request.url).origin);
    const urls = ENTITIES.flatMap(({slug, table, idField}) =>
        (BitCraftTables[table].get() ?? []).map((row: any) =>
            `<url><loc>https://brico.app/database/${slug}/${row[idField]}</loc></url>`));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
    return new Response(xml, {headers: {"Content-Type": "application/xml"}});
}
