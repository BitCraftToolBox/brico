/**
 * Backfills `.po` `msgstr`s for `gameText()` labels from the game's own published translations,
 * so those catalogs don't have to sit empty waiting on Crowdin for wording BitCraft already
 * translates itself.
 *
 * `gameText(msg\`X\`)` / `gameText(msg\`X\`, "Y")` (see `src/lib/labels.ts`) marks a message as
 * game vocabulary; at runtime `useLabel()` already prefers the game CSV over the Lingui catalog
 * for these, so this script changes nothing about what users see — it's purely so the `.po` files
 * on disk (and Crowdin, once synced) show a real translation instead of blank.
 *
 * Steps:
 *  1. Scan `src/**\/*.{ts,tsx}` for `gameText(msg\`…\`)` / `gameText(msg\`…\`, "…")`.
 *  2. Dedupe into (msgid, source) pairs — msgid is always the `msg` content (what Lingui extracts
 *     as the catalog key); source is the second argument if given, else the same text. No
 *     trimming/case-folding of either: both are matched or displayed verbatim elsewhere.
 *  3. Download the 9 non-English game-data CSVs (same source as `src/lib/data-translation.ts`),
 *     parsing each into a `source -> translation` map with the same rules the app uses (first
 *     occurrence wins, skip rows with an empty translation).
 *  4. For each pair, look up `source` in the matching locale's map.
 *  5. Write hits into that locale's `messages.po` at `msgid` — only when its `msgstr` is currently
 *     empty. Never overwrites an existing (e.g. Crowdin-supplied) translation.
 *
 * Usage: node scripts/i18n/backfill-game-translations.mjs [--dry-run]
 */
import {csvParse} from "d3-dsv";
import {readdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parsePo, stringifyPo} from "pofile-ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_DIR = path.join(ROOT, "src");
const LOCALES_DIR = path.join(ROOT, "src/locales");
const CDN_BASE = "https://cdn.brico.app/I18N";
const DRY_RUN = process.argv.includes("--dry-run");

// UI catalog directory (src/locales/<dir>) -> upstream CSV filename (DATA_LOCALES in
// src/lib/data-translation.ts). `en` is the source language (no CSV, nothing to backfill) and
// `zu` is the pseudolocale review target, not a real translation — both intentionally omitted.
const LOCALE_TO_CSV = {
    de: "de",
    es: "es",
    fr: "fr",
    ja: "jp",
    pl: "pl",
    "pt-BR": "pt-BR",
    ru: "ru",
    "zh-Hans": "zh-Hans",
    "zh-Hant": "zh-Hant",
};

// ── 1+2. Scan source for gameText(msg`...`[, "..."]) ───────────────────────

/** Unescapes a JS string/template-literal body (no `${}` support — gameText labels never have one). */
function unescapeJsLiteral(raw) {
    return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|\n|.)/gs, (_, esc) => {
        switch (esc[0]) {
            case "n": return "\n";
            case "r": return "\r";
            case "t": return "\t";
            case "b": return "\b";
            case "f": return "\f";
            case "v": return "\v";
            case "0": return "\0";
            case "\n": case "\r\n": return ""; // line continuation
            case "u": case "x": return String.fromCodePoint(parseInt(esc.slice(1).replace(/[{}]/g, ""), 16));
            default: return esc; // \`, \\, \$, \", \' and anything else -> literal char
        }
    });
}

function listSourceFiles() {
    const files = [];
    for (const entry of readdirSync(SRC_DIR, {withFileTypes: true, recursive: true})) {
        if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
            files.push(path.join(entry.parentPath, entry.name));
        }
    }
    return files;
}

const CALL_RE = /gameText\(\s*msg`((?:\\.|[^`\\])*)`\s*(?:,\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*)?\)/gs;

/** msgid -> source string to match against the game CSVs. */
const pairs = new Map();

for (const file of listSourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(CALL_RE)) {
        const msgid = unescapeJsLiteral(match[1]);
        const sourceArg = match[2];
        const source = sourceArg ? unescapeJsLiteral(sourceArg.slice(1, -1)) : msgid;

        const existing = pairs.get(msgid);
        if (existing !== undefined && existing !== source) {
            console.warn(`[backfill] conflicting sources for msgid ${JSON.stringify(msgid)}: ` +
                `${JSON.stringify(existing)} vs ${JSON.stringify(source)} (${file}) — keeping the first`);
            continue;
        }
        pairs.set(msgid, source);
    }
}

console.log(`Found ${pairs.size} unique gameText() label(s) across the source tree.`);

// ── 3. Download + parse the game-data CSVs ─────────────────────────────────

async function fetchTranslationMap(csvLocale) {
    const url = `${CDN_BASE}/${encodeURIComponent(csvLocale)}.csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
    const rows = csvParse(await response.text());

    const map = new Map();
    for (const row of rows) {
        if (!row.source || !row.translation) continue;
        if (!map.has(row.source)) map.set(row.source, row.translation); // first occurrence wins
    }
    return map;
}

const csvMapCache = new Map(); // csv locale name -> Promise<Map<source, translation>>
function translationMapFor(csvLocale) {
    if (!csvMapCache.has(csvLocale)) csvMapCache.set(csvLocale, fetchTranslationMap(csvLocale));
    return csvMapCache.get(csvLocale);
}

// ── 4+5. Backfill each locale's .po ─────────────────────────────────────────

for (const [poLocale, csvLocale] of Object.entries(LOCALE_TO_CSV)) {
    const poPath = path.join(LOCALES_DIR, poLocale, "messages.po");
    console.log(`\n── ${poLocale} (${csvLocale}.csv)`);

    let map;
    try {
        map = await translationMapFor(csvLocale);
    } catch (e) {
        console.error(`   skipping: ${e.message}`);
        continue;
    }
    console.log(`   ${map.size} usable translation(s) in ${csvLocale}.csv`);

    const po = parsePo(readFileSync(poPath, "utf8"));

    let filled = 0, alreadyTranslated = 0, missedInCsv = 0, notGameText = 0;
    for (const item of po.items) {
        if (item.obsolete || item.msgid_plural) continue;

        const source = pairs.get(item.msgid);
        if (source === undefined) {
            notGameText++;
            continue;
        }
        if (item.msgstr[0]) {
            alreadyTranslated++;
            continue;
        }

        const translation = map.get(source);
        if (translation === undefined) {
            missedInCsv++;
            continue;
        }

        item.msgstr = [translation];
        filled++;
    }

    console.log(`   ${filled} filled, ${alreadyTranslated} already translated, ` +
        `${missedInCsv} not in the game CSV, ${notGameText} not a gameText() msgid`);

    if (filled > 0 && !DRY_RUN) {
        writeFileSync(poPath, stringifyPo(po, {foldLength: 0}));
        console.log(`   wrote ${poPath}`);
    } else if (filled > 0) {
        console.log(`   (dry run — not written)`);
    }
}
