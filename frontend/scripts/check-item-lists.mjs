/**
 * check-item-lists.mjs
 *
 * Analyses ItemListDesc data for nested item lists (items whose ItemDesc.itemListId
 * points to another list), replicating the logic used by computeAveragesFlatExpanded
 * in ItemStacks.tsx.
 *
 * Reports:
 *   - Total item lists
 *   - How many contain at least one sub-list item
 *   - Of those: how many have more than one possibility (so expansion actually changes averages)
 *   - The maximum nesting depth found when recursing sub-lists (with cycle detection)
 *   - Per-depth breakdown
 *   - How many (and which) item lists have no outputs (empty `possibilities`, or every
 *     possibility has an empty `items` array)
 *   - Item lists with several sources (items via ItemDesc.itemListId, enemies via
 *     ContributionLootDesc), or both kinds, mirroring getItemListSources in relations.ts;
 *     lists covered by ITEM_LIST_SOURCE_OVERRIDES are marked, and chosen items starred
 *
 * Run:  npx tsx scripts/check-item-lists.mjs
 */

import {ContributionLootDesc, EnemyDesc, ItemDesc, ItemListDesc} from "@brico/bitcraft-bindings/types";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {AlgebraicType, BinaryReader} from "spacetimedb";
import {ITEM_LIST_SOURCE_OVERRIDES} from "../src/lib/item-list-overrides.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = __dir.endsWith("scripts") ? resolve(__dir, "..") : __dir;

// ── BSATN helpers ──────────────────────────────────────────────

function loadTable(tableName, binding) {
    const bsatnPath = resolve(ROOT, `public/bsatn/static/${tableName}.bsatn`);
    const data = readFileSync(bsatnPath);
    const deserialize = AlgebraicType.makeDeserializer(AlgebraicType.Array(binding.algebraicType));
    const reader = new BinaryReader(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return deserialize(reader);
}

// ── Load data ──────────────────────────────────────────────────

console.log("Loading BSATN data…");
const allLists = loadTable("item_list_desc", ItemListDesc);
const allItems = loadTable("item_desc", ItemDesc);
const allLoots = loadTable("contribution_loot_desc", ContributionLootDesc);
const allEnemies = loadTable("enemy_desc", EnemyDesc);

/** @type {Map<number, import("@brico/bitcraft-bindings/types").ItemDesc>} */
const itemById = new Map(allItems.map(i => [i.id, i]));

/** @type {Map<number, import("@brico/bitcraft-bindings/types").ItemListDesc>} */
const listById = new Map(allLists.map(l => [l.id, l]));

console.log(`  ${allLists.length} item lists, ${allItems.length} items\n`);

// ── Sub-list detection ─────────────────────────────────────────

/**
 * Returns all sub-list IDs referenced by a single ItemListDesc.
 * Mirrors the check in computeAveragesFlatExpanded:
 *   itemType.tag === "Item" && item.itemListId (truthy/nonzero)
 *
 * @param {object} list
 * @returns {Set<number>} Set of sub-list IDs
 */
function subListIdsOf(list) {
    const found = new Set();
    for (const poss of list.possibilities) {
        for (const stack of poss.items) {
            if (stack.itemType?.tag !== "Item") continue;
            const item = itemById.get(stack.itemId);
            if (item?.itemListId) found.add(item.itemListId);
        }
    }
    return found;
}

// ── Depth calculation ──────────────────────────────────────────

/**
 * Compute the nesting depth of a list, recursing into sub-lists.
 * Uses a `visiting` set for cycle detection (returns 0 for already-open nodes).
 *
 * @param {number} listId
 * @param {Set<number>} visiting  Ancestor IDs currently on the call stack
 * @returns {number}  Depth (1 = no sub-lists, 2 = one level deep, etc.)
 */
function depth(listId, visiting = new Set()) {
    if (visiting.has(listId)) return 0;   // cycle — don't recurse further
    const list = listById.get(listId);
    if (!list) return 1;

    visiting.add(listId);
    let maxSub = 0;
    for (const id of subListIdsOf(list)) {
        const d = depth(id, visiting);
        if (d > maxSub) maxSub = d;
    }
    visiting.delete(listId);

    return 1 + maxSub;
}

// ── Analysis ───────────────────────────────────────────────────

/** Lists that contain at least one sub-list reference */
const listsWithSubLists = allLists.filter(l => subListIdsOf(l).size > 0);

/** Of those: lists with more than one top-level possibility */
const listsWithSubListsAndMultiplePossibilities =
    listsWithSubLists.filter(l => l.possibilities.length > 1);

/** Lists with no outputs: no possibilities, or every possibility has no items */
const listsWithNoOutputs = allLists.filter(
    l => l.possibilities.length === 0 || l.possibilities.every(p => p.items.length === 0),
);

/** Compute depth for every list */
const depthCounts = new Map(); // depth → count
let maxDepth = 0;
for (const list of allLists) {
    const d = depth(list.id);
    depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
    if (d > maxDepth) maxDepth = d;
}

// ── Report ─────────────────────────────────────────────────────

const W = 46;
const line = "─".repeat(W);

function row(label, value) {
    const dots = ".".repeat(W - label.length - String(value).length - 2);
    console.log(`  ${label} ${dots} ${value}`);
}

console.log("=== Nested Item List Analysis ===\n");
row("Total item lists",                allLists.length);
row("Lists with sub-list items",       listsWithSubLists.length);
row("  … with >1 possibility",         listsWithSubListsAndMultiplePossibilities.length);
row("Max nesting depth",               maxDepth);

console.log(`\n${line}`);
console.log("  Depth breakdown:");
for (const d of [...depthCounts.keys()].sort((a, b) => a - b)) {
    const count = depthCounts.get(d);
    const label = `    depth ${d}`;
    const dots = ".".repeat(W - label.length - String(count).length);
    console.log(`${label} ${dots} ${count}`);
}

if (listsWithSubLists.length > 0) {
    console.log(`\n${line}`);
    console.log("  Lists with sub-lists:\n");
    for (const list of listsWithSubLists) {
        const subIds = subListIdsOf(list);
        const subNames = [...subIds].map(id => listById.get(id)?.name ?? `#${id}`).join(", ");
        const d = depth(list.id);
        console.log(`  [${list.id}] "${list.name}"`);
        console.log(`        possibilities: ${list.possibilities.length}, depth: ${d}`);
        console.log(`        sub-lists: ${subNames}`);
    }
}

console.log(`\n${line}`);
row("Lists with no outputs", listsWithNoOutputs.length);

if (listsWithNoOutputs.length > 0) {
    console.log(`\n${line}`);
    console.log("  Lists with no outputs:\n");
    for (const list of listsWithNoOutputs) {
        console.log(`  [${list.id}] "${list.name}" — possibilities: ${list.possibilities.length}`);
    }
}

// ── Item list sources ──────────────────────────────────────────

/** @type {Map<number, object[]>} list id → items whose itemListId points at it */
const itemsByList = new Map();
for (const item of allItems) {
    if (!item.itemListId) continue;
    if (!itemsByList.has(item.itemListId)) itemsByList.set(item.itemListId, []);
    itemsByList.get(item.itemListId).push(item);
}

/** @type {Map<number, object[]>} list id → contribution loot rows that yield it */
const lootsByList = new Map();
for (const loot of allLoots) {
    if (!lootsByList.has(loot.itemListId)) lootsByList.set(loot.itemListId, []);
    lootsByList.get(loot.itemListId).push(loot);
}

const enemyByType = new Map(allEnemies.map(e => [e.enemyType, e]));

const multiItemLists = allLists.filter(l => (itemsByList.get(l.id)?.length ?? 0) > 1);
const multiEnemyLists = allLists.filter(l => (lootsByList.get(l.id)?.length ?? 0) > 1);
const mixedSourceLists = allLists.filter(l => itemsByList.has(l.id) && lootsByList.has(l.id));

console.log(`\n${line}`);
row("Lists with >1 item source", multiItemLists.length);
row("Lists with >1 enemy source", multiEnemyLists.length);
row("Lists with item and enemy sources", mixedSourceLists.length);

function overrideLabel(list) {
    const override = ITEM_LIST_SOURCE_OVERRIDES.get(list.id);
    if (override === undefined) return "";
    return override === "Enemy" ? "  (override: enemy)" : `  (override: item ${override})`;
}

function printItemSources(list) {
    const override = ITEM_LIST_SOURCE_OVERRIDES.get(list.id);
    for (const item of itemsByList.get(list.id) ?? []) {
        const star = item.id === override ? "*" : " ";
        console.log(`      ${star} item [${item.id}] "${item.name}"`);
    }
}

function printEnemySources(list) {
    const star = ITEM_LIST_SOURCE_OVERRIDES.get(list.id) === "Enemy" ? "*" : " ";
    for (const loot of lootsByList.get(list.id) ?? []) {
        const enemy = enemyByType.get(loot.enemyTypeId);
        const who = enemy ? `[${enemy.enemyType}] "${enemy.name}"` : `#${loot.enemyTypeId} (no EnemyDesc)`;
        console.log(`      ${star} enemy ${who} — minimumContribution: ${loot.minimumContribution}, weighted: ${loot.weighted}`);
    }
}

function printSourceGroup(title, lists, printers) {
    if (lists.length === 0) return;
    console.log(`\n${line}`);
    console.log(`  ${title}:\n`);
    for (const list of lists) {
        console.log(`  [${list.id}] "${list.name}"${overrideLabel(list)}`);
        for (const print of printers) print(list);
    }
}

printSourceGroup("Lists with more than one item source", multiItemLists, [printItemSources]);
printSourceGroup("Lists with more than one enemy source", multiEnemyLists, [printEnemySources]);
printSourceGroup("Lists with both item and enemy sources", mixedSourceLists, [printItemSources, printEnemySources]);
