/**
 * Smoke test for the game-data translation layer, run against a real upstream CSV and the real
 * BSATN blobs in `public/bsatn/static/`. It exercises the same `translatableFieldsOf` /
 * `translateRow` / `sourceRow` code the app uses, so it catches upstream CSV drift (renamed
 * columns, a changed quoting style) and allow-list mistakes without needing a browser.
 *
 * Worth re-running after a game data update, or whenever `TRANSLATABLE_FIELDS` changes.
 *
 * Run: npm run i18n:verify [-- <locale>]        (default locale: de)
 */
import {AlgebraicType, BinaryReader} from "@clockworklabs/spacetimedb-sdk";
import {csvParse} from "d3-dsv";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sourceRow, TRANSLATABLE_FIELDS, translatableFieldsOf, translateRow} from "../../src/lib/data-translation.ts";
import {BitCraftTables} from "../../src/lib/spacetime.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BSATN_DIR = path.join(ROOT, "public/bsatn/static");
const LOCALE = process.argv[2] ?? "de";

let failures = 0;
const check = (ok, label) => {
    console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

function rowsOf(table) {
    const bytes = readFileSync(path.join(BSATN_DIR, `${table.spacetimeName}.bsatn`));
    return AlgebraicType.createArrayType(table.spacetimeType).deserialize(new BinaryReader(new Uint8Array(bytes)));
}

// ── 1. Fetch + parse the CSV the same way data-translation.ts does ──
console.log(`\n── CSV: ${LOCALE}.csv`);
const response = await fetch(`https://cdn.brico.app/I18N/${encodeURIComponent(LOCALE)}.csv`);
if (!response.ok) {
    console.error(`could not fetch ${LOCALE}.csv: ${response.status}`);
    process.exit(1);
}
const rows = csvParse(await response.text());

const map = new Map();
let emptyTranslation = 0, duplicateSources = 0;
for (const row of rows) {
    if (!row.source || !row.translation) { emptyTranslation++; continue; }
    if (map.has(row.source)) { duplicateSources++; continue; }
    map.set(row.source, row.translation);
}
console.log(`   columns: ${JSON.stringify(rows.columns)}`);
console.log(`   ${rows.length} rows → ${map.size} usable (${emptyTranslation} untranslated, ${duplicateSources} duplicate sources)`);
check(rows.columns?.join() === "index,source,translation,validated", "CSV header matches the expected index,source,translation,validated");
check(map.size > 10000, "a substantial number of translations parsed");

// ── 2. Real rows actually get translated ──
console.log(`\n── Translation coverage`);
const samples = ["ItemDesc", "BuildingDesc", "SkillDesc", "ResourceDesc", "BuildingTypeDesc"];
for (const key of samples) {
    const table = BitCraftTables[key];
    const fields = translatableFieldsOf(table.spacetimeType);
    const data = rowsOf(table);
    const out = data.map(r => translateRow(r, fields, map));
    const changed = out.filter((r, i) => r !== data[i]).length;
    const pct = ((changed / data.length) * 100).toFixed(0);
    console.log(`   ${key}: ${JSON.stringify(fields.map(f => f.name + (f.isArray ? "[]" : "")))} → ${changed}/${data.length} rows (${pct}%)`);
    const first = out.find((r, i) => r !== data[i]);
    if (first) {
        for (const f of fields) {
            const before = sourceRow(first)[f.name], after = first[f.name];
            if (JSON.stringify(before) !== JSON.stringify(after)) {
                const show = v => JSON.stringify(Array.isArray(v) ? v : String(v).slice(0, 60));
                console.log(`      ${f.name}: ${show(before)} → ${show(after)}`);
            }
        }
    }
    check(changed > 0, `${key} has translated rows`);
}

// ── 3. Excluded fields are never touched ──
console.log(`\n── Excluded-field safety`);
const NEVER_TRANSLATE = [
    "iconAssetName", "modelAssetName", "iconAddress", "prefabAddress", "modelAddress",
    "carriedModelAssetName", "animatorState", "color", "emission", "variantMaterial", "vfx",
];
let altered = 0, checkedFields = new Set();
for (const [key, table] of Object.entries(BitCraftTables)) {
    const fields = translatableFieldsOf(table.spacetimeType);
    if (fields.length === 0) continue;
    let data;
    try { data = rowsOf(table); } catch { continue; }
    const out = data.map(r => translateRow(r, fields, map));
    for (let i = 0; i < data.length; i++) {
        for (const f of NEVER_TRANSLATE) {
            if (!(f in data[i])) continue;
            checkedFields.add(f);
            if (data[i][f] !== out[i][f]) {
                if (altered === 0) console.log(`      first violation: ${key}.${f} = ${JSON.stringify(data[i][f])}`);
                altered++;
            }
        }
    }
}
console.log(`   checked ${checkedFields.size} asset/style field names across all tables`);
check(altered === 0, `no asset/style field was altered (found ${altered})`);
check(NEVER_TRANSLATE.every(f => !TRANSLATABLE_FIELDS.has(f)), "allow-list excludes every known asset/style field");

// ── 4. sourceRow round-trip ──
console.log(`\n── sourceRow()`);
const items = rowsOf(BitCraftTables.ItemDesc);
const itemFields = translatableFieldsOf(BitCraftTables.ItemDesc.spacetimeType);
const translatedItems = items.map(r => translateRow(r, itemFields, map));
const firstTranslatedIdx = translatedItems.findIndex((r, i) => r !== items[i]);
const firstUntranslatedIdx = translatedItems.findIndex((r, i) => r === items[i]);
check(firstTranslatedIdx >= 0 && sourceRow(translatedItems[firstTranslatedIdx]).name === items[firstTranslatedIdx].name,
    "sourceRow() recovers the English name from a translated row");
check(firstUntranslatedIdx < 0 || sourceRow(items[firstUntranslatedIdx]) === items[firstUntranslatedIdx],
    "sourceRow() is identity on an untranslated row");
check(!JSON.stringify(translatedItems[Math.max(firstTranslatedIdx, 0)]).includes("sourceRow"),
    "the source-row symbol does not leak into JSON.stringify");

// ── 5. Game-composed {n} recipe templates ──
console.log(`\n── Game-composed templates (recipe names)`);
const recipes = rowsOf(BitCraftTables.CraftingRecipeDesc);
const templated = recipes.filter(r => typeof r.name === "string" && /\{[01]}/.test(r.name));
const translatedTemplates = templated.filter(r => map.has(r.name));
console.log(`   ${templated.length} recipe names contain {0}/{1}; ${translatedTemplates.length} have a translation`);
for (const r of translatedTemplates.slice(0, 3)) {
    console.log(`      ${JSON.stringify(r.name)} → ${JSON.stringify(map.get(r.name))}`);
}
check(translatedTemplates.every(r => /\{[01]}/.test(map.get(r.name))),
    "every translated template keeps its {n} placeholders (relations.ts substitutes by token, so order may differ)");

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
