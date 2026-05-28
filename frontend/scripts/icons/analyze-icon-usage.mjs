// noinspection ES6PreferShortImport

/**
 * analyze-icon-usage.mjs
 *
 * Analyses which font icons are actually used at runtime:
 *
 * 1. Reads font_icons.json — for each table/field pair, deserializes the
 *    BSATN file using the SpacetimeDB SDK and extracts icon field values,
 *    converting them to uppercase hex codepoints.
 * 2. Scans source files for static makeFontIcon("...") and FontIcon codepoint="..." calls.
 * 3. Prints a summary of used vs total icons.
 *
 * Also exports collectUsedCodepoints() for use by the Vite tree-shake plugin.
 *
 * Run:  npm run analyze-icons
 *       (or: npx tsx scripts/analyze-icon-usage.mjs)
 */

import {AlgebraicType, BinaryReader} from "@clockworklabs/spacetimedb-sdk";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

// Binding type modules — they export namespaces with getTypeScriptAlgebraicType()
import {BuffDesc} from "../../src/bindings/src/buff_desc_type.ts";
import {CombatActionDesc} from "../../src/bindings/src/combat_action_desc_type.ts";
import {EmpireIconDesc} from "../../src/bindings/src/empire_icon_desc_type.ts";
import {NpcDesc} from "../../src/bindings/src/npc_desc_type.ts";
import {ProspectingDesc} from "../../src/bindings/src/prospecting_desc_type.ts";
import {SkillDesc} from "../../src/bindings/src/skill_desc_type.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = __dir.endsWith("icons") ? resolve(__dir, "../..") : __dir;

/**
 * Map from table name (as used in font_icons.json / BSATN filenames)
 * to the binding namespace that provides getTypeScriptAlgebraicType().
 */
const TABLE_BINDINGS = {
    buff_desc: BuffDesc,
    combat_action_desc: CombatActionDesc,
    empire_icon_desc: EmpireIconDesc,
    npc_desc: NpcDesc,
    prospecting_desc: ProspectingDesc,
    skill_desc: SkillDesc,
};

// ── Helpers ────────────────────────────────────────────────────

/** Convert snake_case to camelCase */
function snakeToCamel(s) {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Resolve an icon field value to its uppercase hex codepoint,
 * mirroring the logic in font-icons.tsx's resolveEntry().
 *
 * @param {string} value  The raw field value from the game data.
 * @returns {string | undefined}  Uppercase hex codepoint or undefined.
 */
export function fieldValueToCodepoint(value) {
    if (!value || typeof value !== "string") return undefined;

    // Single character → hex codepoint
    if (value.length === 1) {
        return value.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    }

    // Bare hex codepoint (e.g. "FFFA", "fffa")
    if (/^[0-9A-Fa-f]{4,5}$/.test(value)) {
        return value.toUpperCase();
    }

    // Literal escape sequence "\\uFFFA"
    const escapeMatch = value.match(/^\\u([0-9A-Fa-f]{4,5})$/);
    if (escapeMatch) {
        return escapeMatch[1].toUpperCase();
    }

    // Glyph name — the GLYPH_ICONS map uses these as keys directly
    return value;
}

// ── BSATN reading ──────────────────────────────────────────────

/**
 * Read and deserialize a BSATN file, extracting values of a specific field.
 *
 * @param {string} rootDir  Project root directory.
 * @param {string} tableName  Table name (e.g. "buff_desc").
 * @param {string} fieldName  Field name in snake_case (e.g. "icon_asset_name").
 * @returns {string[]}  Array of raw field values.
 */
export function readBsatnIconField(rootDir, tableName, fieldName) {
    const bsatnPath = resolve(rootDir, `public/bsatn/static/${tableName}.bsatn`);
    const camelField = snakeToCamel(fieldName);

    const binding = TABLE_BINDINGS[tableName];
    if (!binding) {
        console.warn(`  ⚠ No binding for table: ${tableName}`);
        return [];
    }

    let data;
    try {
        data = readFileSync(bsatnPath);
    } catch {
        console.warn(`  ⚠ BSATN file not found: ${bsatnPath}`);
        return [];
    }

    const itemType = binding.getTypeScriptAlgebraicType();
    const arrayType = AlgebraicType.createArrayType(itemType);
    const reader = new BinaryReader(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

    let rows;
    try {
        rows = arrayType.deserialize(reader);
    } catch (e) {
        console.warn(`  ⚠ Failed to deserialize ${tableName}: ${e.message}`);
        return [];
    }

    const values = [];
    for (const row of rows) {
        const val = row[camelField];
        if (val != null && val !== "") {
            values.push(val);
        }
    }
    return values;
}

// ── Source scanning ────────────────────────────────────────────

/**
 * Recursively find files matching a pattern.
 */
function findFiles(dir, pattern) {
    const results = [];
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "bindings") {
                results.push(...findFiles(full, pattern));
            } else if (entry.isFile() && pattern.test(entry.name)) {
                results.push(full);
            }
        }
    } catch { /* skip */ }
    return results;
}

/**
 * Scan source files for static makeFontIcon("...") and FontIcon codepoint="..." calls.
 *
 * @param {string} srcDir  Source directory to scan.
 * @returns {Set<string>}  Raw argument strings found.
 */
export function scanSourceForIconUsage(srcDir) {
    const usedRaw = new Set();
    const files = findFiles(srcDir, /\.(tsx?|jsx?)$/);

    for (const file of files) {
        const content = readFileSync(file, "utf8");

        // makeFontIcon("XXXX")
        for (const m of content.matchAll(/makeFontIcon\(\s*["']([^"']+)["']\s*\)/g)) {
            usedRaw.add(m[1]);
        }

        // <FontIcon codepoint="XXXX"
        for (const m of content.matchAll(/codepoint=["']([^"']+)["']/g)) {
            usedRaw.add(m[1]);
        }
    }

    return usedRaw;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Collect all icon codepoints that are actually used.
 *
 * Combines BSATN data (runtime dynamic usage) and source code (static calls).
 * Always includes "xxxx" (the .notdef fallback glyph).
 *
 * @param {string} [rootDir]  Project root directory.
 * @returns {Set<string>}  Uppercase hex codepoint keys used in GLYPH_ICONS.
 */
export function collectUsedCodepoints(rootDir) {
    const root = rootDir || ROOT;
    const fontIconsJson = JSON.parse(readFileSync(resolve(root, "scripts/icons/font_icons.json"), "utf8"));
    const used = new Set(["xxxx"]); // always keep the .notdef fallback

    // 1. BSATN data — extract icon field values from game tables
    for (const [tableName, fieldName] of Object.entries(fontIconsJson)) {
        const values = readBsatnIconField(root, tableName, fieldName);
        for (const val of values) {
            const cp = fieldValueToCodepoint(val);
            if (cp) used.add(cp);
        }
    }

    // 2. Source code — static makeFontIcon / FontIcon calls
    const srcDir = resolve(root, "src");
    const sourceRefs = scanSourceForIconUsage(srcDir);
    for (const raw of sourceRefs) {
        const cp = fieldValueToCodepoint(raw);
        if (cp) used.add(cp);
    }

    return used;
}

// ── CLI runner ─────────────────────────────────────────────────

function main() {
    const fontIconsJson = JSON.parse(readFileSync(resolve(ROOT, "scripts/icons/font_icons.json"), "utf8"));

    console.log("=== BSATN Icon Field Analysis ===\n");

    const bsatnCodepoints = new Set();
    for (const [tableName, fieldName] of Object.entries(fontIconsJson)) {
        console.log(`Table: ${tableName} → field: ${fieldName}`);
        const values = readBsatnIconField(ROOT, tableName, fieldName);
        const cps = new Set();
        for (const val of values) {
            const cp = fieldValueToCodepoint(val);
            if (cp) cps.add(cp);
        }
        console.log(`  Rows: ${values.length}, Unique codepoints: ${cps.size}`);
        if (cps.size > 0) {
            console.log(`  Codepoints: ${[...cps].sort().join(", ")}`);
        }
        for (const cp of cps) {
            bsatnCodepoints.add(cp);
        }
    }

    console.log(`\nTotal unique codepoints from BSATN data: ${bsatnCodepoints.size}`);

    console.log("\n=== Source Code Icon Usage ===\n");

    const srcDir = resolve(ROOT, "src");
    const sourceRefs = scanSourceForIconUsage(srcDir);
    const sourceCodepoints = new Set();
    for (const raw of sourceRefs) {
        const cp = fieldValueToCodepoint(raw);
        if (cp) sourceCodepoints.add(cp);
    }
    console.log(`Static references found: ${sourceRefs.size}`);
    console.log(`Unique codepoints from source: ${sourceCodepoints.size}`);
    if (sourceCodepoints.size > 0) {
        console.log(`Codepoints: ${[...sourceCodepoints].sort().join(", ")}`);
    }

    // Combined
    const allUsed = new Set([...bsatnCodepoints, ...sourceCodepoints, "xxxx"]);

    // Count total icons in font-icons-data.ts
    const dataFile = readFileSync(resolve(ROOT, "src/components/icons/font-icons-data.ts"), "utf8");
    const totalKeys = [...dataFile.matchAll(/^\s*"([^"]+)":\s*\{/gm)].length;

    console.log("\n=== Summary ===\n");
    console.log(`Total icons in font-icons-data.ts: ${totalKeys}`);
    console.log(`Used icons (BSATN + source + fallback): ${allUsed.size}`);
    console.log(`Unused icons: ${totalKeys - allUsed.size}`);
    console.log(`Potential bundle reduction: ${Math.round((1 - allUsed.size / totalKeys) * 100)}%`);
}

// Only run when executed directly (not when imported by the Vite plugin)
if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}


