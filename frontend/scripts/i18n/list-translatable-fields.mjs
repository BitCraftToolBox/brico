/**
 * One-off audit script backing the `TRANSLATABLE_FIELDS` constant in `src/lib/data-translation.ts`.
 *
 * Reflects on every table registered in `BitCraftTables` (same `spacetimeType.product.elements`
 * technique as `BitCraftTable.tagToOrdinal()`), collects every field whose type is a string —
 * plain `String`, `Option<String>`, or `String[]` — and reports it grouped by *field name*, since
 * the decision we need to make is a flat, global, human-reviewed name list rather than a per-table
 * map or a runtime heuristic.
 *
 * Sample values come from the real BSATN blobs checked into `public/bsatn/static/`, so the output
 * is enough to eyeball which fields are player-facing prose vs. asset paths / internal identifiers.
 *
 * Run: npm run i18n:audit-fields [-- --samples 5] [--field name]
 */
import {AlgebraicType, BinaryReader} from "@clockworklabs/spacetimedb-sdk";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {BitCraftTables} from "../../src/lib/spacetime.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BSATN_DIR = path.join(ROOT, "public/bsatn/static");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SAMPLES = Number(flag("samples", 3));
const ONLY_FIELD = flag("field", null);

/**
 * Classifies an AlgebraicType as a string-bearing shape, or returns null.
 * `Option<T>` is a SumType with `some`/`none` variants in this SDK.
 */
function stringShape(type) {
    if (!type) return null;
    if (type.type === "String") return "string";
    if (type.type === "ArrayType" && type.array?.type === "String") return "string[]";
    if (type.type === "SumType") {
        const variants = type.sum?.variants ?? [];
        const some = variants.find(v => v.name === "some");
        const isOption = variants.length === 2 && some && variants.some(v => v.name === "none");
        if (isOption) {
            const inner = stringShape(some.algebraicType);
            if (inner) return `${inner}?`;
        }
    }
    return null;
}

/** Pull `count` distinct, non-empty sample values for a field out of loaded rows. */
function samplesFor(rows, field, shape, count) {
    const out = [];
    const seen = new Set();
    for (const row of rows) {
        let value = row?.[field];
        if (value == null) continue;
        // Option<String> rows come back as the bare value or undefined in the generated bindings,
        // but tolerate the tagged form too in case a binding surfaces it directly.
        if (typeof value === "object" && !Array.isArray(value) && "tag" in value) {
            if (value.tag !== "some") continue;
            value = value.value;
        }
        const candidates = Array.isArray(value) ? value : [value];
        for (const c of candidates) {
            if (typeof c !== "string" || c.length === 0) continue;
            if (seen.has(c)) continue;
            seen.add(c);
            out.push(c);
            if (out.length >= count) return out;
        }
    }
    return out;
}

function loadRows(table) {
    const file = path.join(BSATN_DIR, `${table.spacetimeName}.bsatn`);
    try {
        const bytes = readFileSync(file);
        const reader = new BinaryReader(new Uint8Array(bytes));
        return AlgebraicType.createArrayType(table.spacetimeType).deserialize(reader);
    } catch (e) {
        console.warn(`[warn] could not load ${table.spacetimeName}.bsatn: ${e.message}`);
        return null;
    }
}

// field name -> { shapes: Set, tables: [{table, rowCount, samples}] }
const byField = new Map();
let tablesScanned = 0;

for (const [key, table] of Object.entries(BitCraftTables)) {
    const elements = table.spacetimeType?.product?.elements ?? [];
    const stringFields = elements
        .map(e => ({name: e.name, shape: stringShape(e.algebraicType)}))
        .filter(e => e.shape && (!ONLY_FIELD || e.name === ONLY_FIELD));
    if (stringFields.length === 0) continue;

    const rows = loadRows(table);
    tablesScanned++;

    for (const {name, shape} of stringFields) {
        let entry = byField.get(name);
        if (!entry) {
            entry = {shapes: new Set(), tables: []};
            byField.set(name, entry);
        }
        entry.shapes.add(shape);
        entry.tables.push({
            table: key,
            rowCount: rows?.length ?? 0,
            samples: rows ? samplesFor(rows, name, shape, SAMPLES) : [],
        });
    }
}

// Report — most widely-used fields first, since those are the ones worth getting right.
const sorted = [...byField.entries()].sort((a, b) =>
    b[1].tables.length - a[1].tables.length || a[0].localeCompare(b[0])
);

console.log(`Scanned ${tablesScanned} tables with string fields; ${sorted.length} distinct field names.\n`);

for (const [field, entry] of sorted) {
    const shapes = [...entry.shapes].join(" | ");
    const tableNames = entry.tables.map(t => t.table).join(", ");
    console.log(`── ${field}  (${shapes})  ×${entry.tables.length} tables`);
    console.log(`   tables: ${tableNames}`);
    const withSamples = entry.tables.filter(t => t.samples.length > 0);
    for (const t of withSamples.slice(0, 4)) {
        console.log(`   ${t.table} (${t.rowCount} rows): ${t.samples.map(s => JSON.stringify(s.length > 90 ? s.slice(0, 90) + "…" : s)).join(", ")}`);
    }
    if (withSamples.length === 0) console.log("   (no sample values found — field empty across all rows)");
    console.log();
}

console.log("── Field-name list (paste-ready) ──");
console.log(sorted.map(([f]) => `"${f}"`).join(", "));
