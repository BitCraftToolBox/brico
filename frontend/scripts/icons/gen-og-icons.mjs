/**
 * gen-og-icons.mjs
 *
 * Rasterizes the BitCraft font-icon glyphs and the Brico face (public/brico-face.svg) to
 * branded PNGs for use as Open Graph / social thumbnails — OG tags don't support SVG, and these
 * must be absolute raster images.
 *
 * Glyph data is sourced from src/components/icons/font-icons-data.ts (the GLYPH_ICONS map),
 * NOT scripts/icons/data/*.svg — that dir is gitignored (the raw SVGs are only used locally to
 * regenerate font-icons-data.ts, see gen-font-icons.mjs) and isn't present at build time.
 *
 * Output:
 *   public/og-icons/<CODEPOINT>.png   (one per glyph, e.g. FFFA.png)
 *   public/brico-face.png             (the default branded thumbnail)
 *
 * Each glyph is centered on a rounded brand-blue square with a cream fill (matching the index
 * BricoFace palette), so it reads on any consumer's card background.
 *
 * Run:  node scripts/icons/gen-og-icons.mjs   (or: npm run gen-og-icons)
 *
 * Font-icon glyphs are generated for ALL entries in GLYPH_ICONS (not just the tree-shaken set):
 * skill/combat icons are chosen from live data at runtime, so the build can't know which subset
 * is reachable.
 */

import {Resvg} from "@resvg/resvg-js";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(__dir, "../../src/components/icons/font-icons-data.ts");
const publicDir = resolve(__dir, "../../public");
const outDir = resolve(publicDir, "og-icons");

const BG = "#e8dec3";
const FG = "#15557d";
const SIZE = 512;          // output canvas (px)
const RADIUS = 64;         // rounded-corner radius
const PAD = 84;            // padding around the glyph

/** Extract `viewBox` and the inner markup (everything inside the root <svg>…</svg>). */
function parseSvg(content) {
    const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) return null;
    const viewBox = viewBoxMatch[1];

    // End of the opening <svg …> tag → start of </svg>.
    const openEnd = content.indexOf(">", content.indexOf("<svg"));
    const close = content.lastIndexOf("</svg>");
    if (openEnd === -1 || close === -1) return null;

    const inner = content.slice(openEnd + 1, close).trim();
    return {viewBox, inner};
}

/**
 * Compose a branded square SVG around the glyph and rasterize it to a PNG buffer.
 * The inner markup's `currentColor` fills are hard-swapped to the cream foreground.
 */
function rasterize({viewBox, inner}) {
    const [minX, minY, w, h] = viewBox.split(/\s+/).map(Number);
    const box = SIZE - 2 * PAD;
    const scale = box / Math.max(w, h);
    // Center the (scaled) glyph within the padded box.
    const tx = PAD + (box - w * scale) / 2 - minX * scale;
    const ty = PAD + (box - h * scale) / 2 - minY * scale;

    const glyph = inner.replaceAll("currentColor", FG);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
        + `<rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="${BG}"/>`
        + `<g fill="${FG}" transform="translate(${tx} ${ty}) scale(${scale})">${glyph}</g>`
        + `</svg>`;

    return new Resvg(svg).render().asPng();
}

/**
 * Load the GLYPH_ICONS map out of font-icons-data.ts without a TS toolchain: the file is
 * generated as a plain JS object literal (see gen-font-icons.mjs), so we can slice it out of
 * the source text and evaluate it directly.
 */
function loadGlyphIcons() {
    const src = readFileSync(dataFile, "utf8");
    const start = src.indexOf("{", src.indexOf("GLYPH_ICONS"));
    const end = src.lastIndexOf("};");
    if (start === -1 || end === -1) {
        throw new Error(`Could not locate GLYPH_ICONS object literal in ${dataFile}`);
    }
    return new Function(`return (${src.slice(start, end + 1)});`)();
}

mkdirSync(outDir, {recursive: true});

// ─── Font glyphs ────────────────────────────────────────────────
const glyphIcons = loadGlyphIcons();
let written = 0;
for (const [codepoint, {viewBox, c}] of Object.entries(glyphIcons)) {
    writeFileSync(resolve(outDir, `${codepoint}.png`), rasterize({viewBox, inner: c}));
    written++;
}
console.log(`Wrote ${written} glyph PNGs → ${outDir}`);

// ─── Brico face (default thumbnail) ─────────────────────────────
const face = parseSvg(readFileSync(resolve(publicDir, "brico-face.svg"), "utf8"));
if (!face) {
    console.error("Could not parse public/brico-face.svg");
    process.exit(1);
}
writeFileSync(resolve(publicDir, "brico-face.png"), rasterize(face));
console.log(`Wrote brico-face.png → ${publicDir}`);
