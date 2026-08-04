/**
 * og-meta.ts — Central helpers for per-page social/SEO metadata.
 *
 * One source of truth for the absolute site URL, OG image resolution (CDN raster icons vs.
 * build-rasterized font-icon PNGs vs. the branded thumbnail), and the description/keyword
 * templates. Consumed by MainLayout (the single meta sink) and the page/detail layouts.
 */

import {useLocation} from "@solidjs/router";
import {Rarity} from "~/bindings/src/rarity_type";
import {codepointKey} from "~/components/icons/font-icons";
import {GLYPH_ICONS} from "~/components/icons/font-icons-data";
import {getAssetURL} from "~/lib/bitcraft-utils";
import {PAGE_ICON_CODEPOINTS, SidebarPages} from "~/lib/sidebar-items";

export const SITE_URL = "https://brico.app";

/** Official game site — used for the footer's outbound link and the `VideoGame` entity's `sameAs`. */
export const BITCRAFT_URL = "https://bitcraftonline.com";

/**
 * Default `<title>` suffix — just the brand, for aux pages (settings, search, the tools).
 *
 * Pages that are actually competing for game-term searches use `BITCRAFT_TITLE_SUFFIX` instead:
 * "bitcraft" was previously absent from every `<title>` on the site, which left nothing tying a
 * result for e.g. "Hexcoin" to the game it belongs to.
 */
export const TITLE_SUFFIX = "Brico's Toolbox";
/** `<title>` suffix for detail + table pages (see `TITLE_SUFFIX`). */
export const BITCRAFT_TITLE_SUFFIX = "BitCraft Database | Brico's Toolbox";

/** Large banner image — index page only (summary_large_image card). */
export const OG_LARGE = "/brico.png";
/** Branded square thumbnail — tables, aux pages, and detail fallback (summary card). */
/*  Generated at build time by scripts/icons/gen-og-icons.mjs. */
export const OG_THUMBNAIL = "/brico-face.png";

/**
 * Canonical URL of the current route: bare path, dropping UI-state query params (`?info=`,
 * `?detail=`, `?q=`) so their variants don't fragment into separate indexable URLs. Shared by the
 * `<link rel="canonical">`/`og:url` tags and the JSON-LD page nodes, which must agree.
 */
export function useCanonicalUrl(): () => string {
    const location = useLocation();
    return () => `${SITE_URL}${location.pathname}`;
}

/** Promote a root-relative path to an absolute URL; pass through anything already absolute. */
export function absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * OG image for an entity that has a CDN raster icon (items, resources, creatures, …).
 * getAssetURL already yields an absolute cdn.brico.app .webp; absoluteUrl covers the
 * `/assets/Unknown.webp` fallback case.
 */
export function ogImageForAsset(iconAssetName: string | undefined, quantity?: number): string {
    if (!iconAssetName) return absoluteUrl(OG_THUMBNAIL);
    return absoluteUrl(getAssetURL(iconAssetName, quantity));
}

/**
 * OG image for a font-icon glyph (skills, combat actions, buffs, …). Resolves the id to its
 * codepoint key and points at the build-rasterized PNG. Falls back to the branded thumbnail when
 * the id doesn't resolve, or resolves to a codepoint with no glyph (hence no generated PNG) — e.g.
 * placeholder entities like the "ANY" skill. Membership in GLYPH_ICONS mirrors the generated PNG
 * set: every real glyph is rasterized, and tree-shaking only ever drops codepoints nothing uses.
 */
export function ogImageForCodepoint(id: string | undefined): string {
    const key = id ? codepointKey(id) : undefined;
    if (!key || !(key in GLYPH_ICONS)) return absoluteUrl(OG_THUMBNAIL);
    return absoluteUrl(`/og-icons/${key}.png`);
}

/** OG image for a detail page whose icon is a fixed section page-icon (biome, achievement, …). */
export function ogImageForPage(pageTitle: SidebarPages): string {
    return ogImageForCodepoint(PAGE_ICON_CODEPOINTS[pageTitle]);
}

function capitalize(s: string): string {
    return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function truncate(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1).trimEnd() + "…";
}

/** Description for a database table/list page. */
export function tableMetaDescription(title: string, count?: number): string {
    const n = count != null ? `${count.toLocaleString()} ` : "";
    return `Browse all ${n}${title.toLowerCase()} in BitCraft — stats, recipes, and more on Brico.app, the BitCraft online compendium.`;
}

export interface DetailMeta {
    /** Noun for this entity type, e.g. "resource", "item", "skill". */
    kind: string;
    tier?: number;
    rarity?: string;
    tag?: string;
    /** The entity's own in-game description, if any. */
    description?: string;
}

/**
 * Description for a detail page. Leads with the tier/rarity/tag line (e.g. "Tier 6 Rare Tree.")
 * then the entity's own description when present, else a branded call-to-action.
 */
export function detailMetaDescription(meta: DetailMeta): string {
    const lead = [
        meta.tier && meta.tier > 0 ? `Tier ${meta.tier}` : meta.tier ? "Untiered" : null,
        meta.rarity && meta.rarity !== Rarity.Default.tag ? meta.rarity : null,
        meta.tag ?? capitalize(meta.kind),
    ].filter(Boolean).join(" ");
    const tail = meta.description?.trim()
        ? truncate(meta.description, 150)
        : `View ${meta.kind} details on Brico.app.`;
    return lead ? `${lead}. ${tail}` : tail;
}

/**
 * Keyword list for a detail page. Always includes "bitcraft" + the kind, plus rarity/tag and —
 * for a tier — both the full form and the common shorthand ("tier 1", "t1"). De-duped.
 * (Modern search engines largely ignore <meta name="keywords">, but it's cheap and harmless.)
 */
export function metaKeywords(meta: DetailMeta): string {
    const terms = ["bitcraft", meta.kind];
    if (meta.tier != null) terms.push(`tier ${meta.tier}`, `t${meta.tier}`);
    if (meta.rarity) terms.push(meta.rarity.toLowerCase());
    if (meta.tag) terms.push(meta.tag.toLowerCase());
    return [...new Set(terms.filter(Boolean))].join(", ");
}
