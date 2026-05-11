/**
 * vite-plugin-tree-shake-icons.mjs
 *
 * Vite plugin that tree-shakes unused font icon entries from font-icons-data.ts
 * at build time. Delegates all analysis logic to analyze-icon-usage.mjs.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectUsedCodepoints } from "./analyze-icon-usage.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
// When loaded by Vite, import.meta.url points to the bundled config in frontend/,
// not scripts/. When run directly, __dir is scripts/ and ROOT goes up one level.
const ROOT = __dir.endsWith("scripts") ? resolve(__dir, "..") : __dir;

const FONT_ICONS_DATA_RE = /font-icons-data\.(ts|js)$/;

/**
 * Vite plugin that removes unused icon entries from font-icons-data.ts.
 *
 * @returns {import('vite').Plugin}
 */
export default function treeShakeFontIcons() {
    /** @type {Set<string> | null} */
    let usedCodepoints = null;

    return {
        name: "tree-shake-font-icons",

        // Only run during build, not dev (dev benefits from having all icons for hot reload)
        apply: "build",

        // Run before other transforms (TS compilation) so entries are still single-line
        enforce: "pre",

        transform: {
            filter: {
                id: FONT_ICONS_DATA_RE,
            },
            handler(src, id) {
                // Lazily compute used codepoints on first transform
                if (!usedCodepoints) {
                    usedCodepoints = collectUsedCodepoints(ROOT);
                    console.log(`[tree-shake-font-icons] Keeping ${usedCodepoints.size} icons, removing unused entries`);
                }

                // With enforce: "pre", we receive the raw TS source where each
                // entry is a single line:  "XXXX": { viewBox: "...", c: "..." },
                const lines = src.split("\n");
                const filtered = [];
                let removed = 0;

                for (const line of lines) {
                    const keyMatch = line.match(/^\s*"([^"]+)":\s*\{/);
                    if (keyMatch) {
                        const key = keyMatch[1];
                        if (!usedCodepoints.has(key)) {
                            removed++;
                            continue;
                        }
                    }
                    filtered.push(line);
                }

                console.log(`[tree-shake-font-icons] Removed ${removed} unused icon entries from ${id}`);

                return {
                    code: filtered.join("\n"),
                    map: null,
                };
            },
        },
    };
}
