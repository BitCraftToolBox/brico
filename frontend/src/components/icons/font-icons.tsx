/**
 * font-icons.tsx — Runtime helpers for BitCraft game icons.
 *
 * Lookup priority:
 *   - Single character (e.g. "\uFFEE" from SkillDesc.iconAssetName)
 *     → converted to uppercase hex codepoint, looked up in CP_ICONS
 *   - Uppercase hex string (e.g. "FFFA")
 *     → looked up directly in CP_ICONS
 *   - Glyph name string (e.g. "uniFFFA", "A", "Aring")
 *     → looked up in GLYPH_ICONS
 *
 * Usage:
 *
 *   // As an inline component (JSX):
 *   <FontIcon codepoint="\uFFEE" class="size-5" />
 *   <FontIcon codepoint="FFFA" class="size-5" />
 *
 *   // As an IconTypes-compatible function (for sidebar icon: field etc.):
 *   import { makeFontIcon } from "~/lib/font-icons";
 *   const ItemIcon = makeFontIcon("FFFA");   // returns (props) => JSX.Element
 *
 *   // From a type with an icon asset name:
 *   const SkillIcon = makeFontIcon(skill.iconAssetName);
 */

import {type IconProps, type IconTree, type IconTypes} from "solid-icons";
import {JSX, splitProps} from "solid-js";
import {type FontIconEntry, GLYPH_ICONS} from "./font-icons-data";

function entryToIconTree(entry: FontIconEntry): IconTree {
    return {
        a: {viewBox: entry.viewBox},
        c: entry.c,
    };
}

/**
 * Custom SVG renderer for font icons.
 *
 * Unlike solid-icons' `CustomIcon`/`IconTemplate`, this version does NOT set
 * explicit `height`/`width` attributes unless `props.size` is provided.
 * This lets Tailwind class-based sizing (e.g. `class="size-5"`) work correctly
 * without being overridden by SVG presentation attributes.
 */
function renderIconSvg(tree: IconTree, props: IconProps & Record<string, unknown>): JSX.Element {
    const [local, rest] = splitProps(props as Record<string, unknown>, ["size", "title", "style", "color"]);
    return (
        <svg
            {...tree.a}
            {...rest}
            color={(local.color as string | undefined) || "currentColor"}
            {...(local.size != null ? {height: local.size as string, width: local.size as string} : {})}
            xmlns="http://www.w3.org/2000/svg"
            style={{
                ...(typeof local.style === "object" ? (local.style as object) : {}),
                overflow: "visible",
            }}
            innerHTML={local.title ? `${tree.c}<title>${local.title as string}</title>` : (tree.c as string)}
        />
    );
}

/**
 * Normalize an arbitrary identifier to a FontIconEntry, or undefined if not found.
 *
 * Accepts:
 *   - single Unicode character
 *   - 4–5 char hex string
 *   - "\uXXXX" escape sequence
 */
function resolveEntry(id: string): FontIconEntry {
    const fallback = GLYPH_ICONS["xxxx"]; // .notdef

    if (!id) return fallback;

    // Single character → convert to hex codepoint
    if (id.length === 1) {
        const cp = id.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
        return GLYPH_ICONS[cp] ?? fallback;
    }

    // Looks like a bare hex codepoint (e.g. "FFFA", "fffa")
    if (/^[0-9A-Fa-f]{4,5}$/.test(id)) {
        return GLYPH_ICONS[id.toUpperCase()] ?? fallback;
    }

    // Literal escape sequence (e.g. "\\uFFFA" or "\\uFFEE")
    const escapeMatch = id.match(/^\\u([0-9A-Fa-f]{4,5})$/);
    if (escapeMatch) {
        return GLYPH_ICONS[escapeMatch[1].toUpperCase()] ?? fallback;
    }

    return fallback;
}

/**
 * Create an `IconTypes`-compatible SolidJS icon component.
 *
 * Returns `undefined` if the requested icon doesn't exist.
 *
 * @example
 * const ItemIcon = makeFontIcon("FFFA")!;
 * <ItemIcon class="size-5" />
 *
 * // In sidebar definition:
 * { title: "Items", href: "/database/item", icon: makeFontIcon("FFFA") }
 */
export function makeFontIcon(id: string): IconTypes {
    const entry = resolveEntry(id);
    const tree = entryToIconTree(entry);
    return (props: IconProps) => renderIconSvg(tree, props as IconProps & Record<string, unknown>);
}

export interface FontIconProps extends IconProps {
    /** Unicode character (e.g. "\uFFEE"), hex string (e.g. "FFFA"), or character */
    codepoint: string;
    /** Fallback element rendered when the icon is not found */
    fallback?: JSX.Element;
}

/**
 * Renders a BitCraft font icon by codepoint/character.
 *
 * @example
 * <FontIcon codepoint={skill.iconAssetName} class="size-5" />
 * <FontIcon codepoint="FFFA" class="size-4 text-muted-foreground" />
 */
export function FontIcon(props: FontIconProps): JSX.Element {
    const [local, others] = splitProps(props as FontIconProps & Record<string, unknown>, ["codepoint", "fallback"]);
    if (!local.codepoint) return (local.fallback ?? null) as JSX.Element;
    const entry = resolveEntry(local.codepoint);
    if (!entry) return (local.fallback ?? null) as JSX.Element;
    const tree = entryToIconTree(entry);
    return renderIconSvg(tree, others as IconProps & Record<string, unknown>);
}
