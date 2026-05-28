#!/usr/bin/env node
/**
 * Fails the build / typecheck if any source file contains a barrel import from
 * "~/bindings/src" (the auto-generated SpacetimeDB SDK index).
 *
 * ✅ Allowed:  from "~/bindings/src/item_type_type"
 * ❌ Blocked:  from "~/bindings/src"
 *
 * The barrel re-exports every table descriptor at once, bloating bundles and
 * making tree-shaking impossible.  Always import the specific module instead.
 */

import {readdirSync, readFileSync} from "fs";
import {join, relative} from "path";

const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

// Matches:  from "~/bindings/src"  or  from '~/bindings/src'
// The look-ahead ensures the quote closes *immediately* – no slash or identifier follows.
const BARREL_RE = /from\s+["']~\/bindings\/src["']/;

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
                `\n\x1b[31mBarrel import from "~/bindings/src" is not allowed.\x1b[0m\n` +
                `  ${rel}:${idx + 1}\n` +
                `  ${line.trim()}\n` +
                `\n  Use a specific module instead, e.g.:\n` +
                `  \x1b[32mimport { ItemDesc } from "~/bindings/src/item_desc_type"\x1b[0m\n`
            );
            found = true;
        }
    });
}

if (found) {
    process.exit(1);
} else {
    console.log("\x1b[32m✓ No barrel imports from ~/bindings/src found.\x1b[0m");
}

