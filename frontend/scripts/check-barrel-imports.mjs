#!/usr/bin/env node
/**
 * Fails the build / typecheck if any source file contains a barrel import from
 * "@brico/bitcraft-bindings/index" (the auto-generated `index.ts`, which pulls in the full
 * `DbConnection`/reducer/schema machinery for a *live* SpacetimeDB connection).
 *
 * ✅ Allowed:  from "@brico/bitcraft-bindings/types"
 * ❌ Blocked:  from "@brico/bitcraft-bindings/index"
 *
 * `@brico/bitcraft-bindings` is only ever used here for offline BSATN decoding (see
 * `~/lib/bitcraft-data.ts`), never a live connection — importing `index.ts` would drag that whole
 * connection surface (and its own `spacetimedb` re-exports) into the bundle for nothing.
 */

import {readdirSync, readFileSync} from "fs";
import {join, relative} from "path";

const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

// Matches:  from "@brico/bitcraft-bindings/index"  or  from '@brico/bitcraft-bindings'
// (either quote style).  The package's `exports` map has no "." entry, so the bare specifier
// doesn't actually resolve — it's matched here only to produce this error instead of a
// resolution failure.  The quote must close *immediately*: no slash or identifier follows.
const BARREL_RE = /from\s+["']@brico\/bitcraft-bindings(?:\/index)?["']/;

/** Recursively walk a directory and yield .ts / .tsx file paths. */
function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            // skip node_modules or .git inside src (shouldn't exist, but just in case)
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            yield* walk(full);
        } else if (entry.isFile() && /\.(tsx?|mts)$/.test(entry.name)) {
            yield full;
        }
    }
}

let found = false;

for (const filePath of walk(ROOT)) {
    const src = readFileSync(filePath, "utf8");
    const lines = src.split("\n");

    lines.forEach((line, idx) => {
        if (BARREL_RE.test(line)) {
            const rel = relative(ROOT, filePath).replace(/\\/g, "/");
            console.error(
                `\n\x1b[31mBarrel import from the @brico/bitcraft-bindings index is not allowed.\x1b[0m\n` +
                `  ${rel}:${idx + 1}\n` +
                `  ${line.trim()}\n` +
                `\n  Use the types module instead, e.g.:\n` +
                `  \x1b[32mimport { ItemDesc } from "@brico/bitcraft-bindings/types"\x1b[0m\n`
            );
            found = true;
        }
    });
}

if (found) {
    process.exit(1);
} else {
    console.log("\x1b[32m✓ No barrel imports from the @brico/bitcraft-bindings index found.\x1b[0m");
}

