/**
 * sidebar-items.ts — Static data for sidebar navigation groups.
 *
 * Extracted here (rather than living in app-sidebar.tsx) so that:
 *  - settings.tsx can derive ALL_SIDEBAR_HREFS for the favorites feature
 *  - app-sidebar.tsx still owns rendering/behavior
 */
import {msg} from "@lingui/core/macro";
import {type IconTypes} from "solid-icons";
import {makeFontIcon} from "~/components/icons/font-icons";
import {gameText, type Label} from "~/lib/labels";

export type SidebarItemDef = {
    /**
     * Canonical English title. Doubles as this page's *identity* — it keys `PAGE_ICONS` /
     * `PAGE_ICON_CODEPOINTS` and backs the `SidebarPages` type — so it must never be localized.
     * Render `titleLabel` instead.
     */
    title: string
    /**
     * Localizable label for display. This data is built at module scope, outside any component, so
     * it holds an unresolved `Label` to be resolved with `useLabel()` at render time rather than an
     * already-translated string (which would freeze at module-eval time and never react to a
     * locale change).
     */
    titleLabel: Label
    href: string
    icon: IconTypes
    disabled?: boolean
}

export type SidebarGroupDef = {
    /** Canonical English group name — persisted in `sidebarCollapsedGroups`, so keep it stable. */
    name: string
    /** Localizable group heading; resolve with `useLabel()`. See `SidebarItemDef.titleLabel`. */
    nameLabel: Label
    items: SidebarItemDef[]
}

const sidebarGroups = [
    {
        name: "Compendium", nameLabel: gameText(msg`Compendium`),
        items: [
            {href: '/database/item', title: 'Items', titleLabel: gameText(msg`Items`), codepoint: "FFFB"},
            {href: '/database/cargo', title: 'Cargo', titleLabel: gameText(msg`Cargo`), codepoint: "FFF4"},
            {href: '/database/creature', title: 'Creatures', titleLabel: gameText(msg`Creatures`), codepoint: "FFF7"},
            {href: '/database/resource', title: 'Resources', titleLabel: gameText(msg`Resources`), codepoint: "FFFE"},
            {href: '/database/building', title: 'Structures', titleLabel: gameText(msg`Structures`), codepoint: "FFF3"},
            {href: '/database/collectible', title: 'Collection', titleLabel: gameText(msg`Collection`), codepoint: "FFD9"},
            {href: '/database/knowledge', title: 'Knowledge', titleLabel: gameText(msg`Knowledge`), codepoint: "FFFC"},
        ] as const
    },
    {
        name: "Item Details", nameLabel: gameText(msg`Item Details`),
        items: [
            {href: '/database/food', title: 'Food', titleLabel: gameText(msg`Food`), codepoint: "008A"},
            // TODO on tools and weapons - game only has singular strings, works in some languages but awkward in others
            {href: '/database/tool', title: 'Tools', titleLabel: gameText(msg`Tools`, "Tool"), codepoint: "0086"},
            {href: '/database/weapon', title: 'Weapons', titleLabel: gameText(msg`Weapons`, "Weapon"), codepoint: "FFAE"},
            {href: '/database/equipment', title: 'Equipment', titleLabel: gameText(msg`Equipment`), codepoint: "FFE2"},
            {href: '/database/item-list', title: 'Item Lists', titleLabel: gameText(msg`Item Lists`), codepoint: "0112"},
        ] as const
    },
    {
        name: "Progression", nameLabel: gameText(msg`Progression`),
        items: [
            {href: '/database/achievement', title: 'Achievements', titleLabel: gameText(msg`Achievements`), codepoint: "FFE3"},
            // TODO this is translated incorrectly as a verb ("Claim") in every other language. Just use the Research label for now, check back if they fix it
            {href: '/database/claim-research', title: 'Claim Research', titleLabel: gameText(msg`Claim Research`, "Research"), codepoint: "FFDF"},
            {href: '/database/quest-chain', title: 'Quest Chains', titleLabel: gameText(msg`Quests`), codepoint: "0107"},
            {href: '/database/skill', title: 'Skills', titleLabel: gameText(msg`Skills`), codepoint: "FFF2"},
        ] as const
    },
    {
        name: "Character", nameLabel: gameText(msg`Character`),
        items: [
            {href: '/database/deployable', title: 'Deployables', titleLabel: gameText(msg`Deployables`), codepoint: "FFD4"},
            {href: '/database/placeable', title: 'Placeables', titleLabel: gameText(msg`Placeables`), codepoint: "0072"},
            {href: '/database/combat', title: 'Combat Abilities', titleLabel: gameText(msg`Combat Abilities`, "Abilities"), codepoint: "FFC3"},
            {href: '/database/buff', title: 'Buffs', titleLabel: gameText(msg`Buffs`), codepoint: "FFD0"},
        ] as const
    },
    {
        name: "World", nameLabel: gameText(msg`World`),
        items: [
            {href: '/database/traveler-task', title: 'Traveler Tasks', titleLabel: gameText(msg`Traveler Tasks`), codepoint: "FFFF"},
            // TODO game has strings like "{0} Traveler Trades {1}" and "{0}\nTraveler Trades {1}", but post-processing seems silly
            {href: '/database/traveler-trade', title: 'Traveler Trades', titleLabel: gameText(msg`Traveler Trades`), codepoint: "008E"},
            {href: '/database/prospecting', title: 'Prospecting', titleLabel: gameText(msg`Prospecting`), codepoint: "FFB0"},
            {href: '/database/biome', title: 'Biomes', titleLabel: gameText(msg`Biomes`), codepoint: "FFF1"},
            {href: '/database/paving', title: 'Paving', titleLabel: gameText(msg`Paving`), codepoint: "0041"},
            {href: '/database/terraforming', title: 'Terraforming', titleLabel: gameText(msg`Terraforming`), codepoint: "0034"},
        ] as const
    },
    {
        name: "Toolbox", nameLabel: msg`Toolbox`,
        items: [
            {href: '/events', title: 'Event Timers', titleLabel: msg`Event Timers`, codepoint: "FFFE"},
            {href: '/tools/emblem', title: 'Emblem Editor', titleLabel: msg`Emblem Editor`, codepoint: "FFB7"},
            {href: '/tools/placeable-graph', title: 'Placeable Graph', titleLabel: msg`Placeable Graph`, codepoint: "0072"},
            {href: '/tools/quest-graph', title: 'Quest Graph', titleLabel: msg`Quest Graph`, codepoint: "0107"},
        ] as const
    },
] as const;

export type SidebarPages = typeof sidebarGroups[number]["items"][number]["title"];
export type SidebarHrefs = typeof sidebarGroups[number]["items"][number]["href"];

export const SIDEBAR_GROUPS: SidebarGroupDef[] = sidebarGroups.map(g => ({
    name: g.name,
    nameLabel: g.nameLabel,
    items: g.items.map(i => ({title: i.title, titleLabel: i.titleLabel, href: i.href, icon: makeFontIcon(i.codepoint)})),
}));

/** Flat list of all sidebar hrefs — used by settings to derive favorites. */
export const ALL_SIDEBAR_HREFS: string[] = sidebarGroups.flatMap(g => g.items.map(i => i.href));

/** Font-icon codepoint for each page, keyed by title — used to derive OG thumbnails. */
export const PAGE_ICON_CODEPOINTS: Record<SidebarPages, string> = Object.fromEntries(
    sidebarGroups.flatMap(g => g.items.map(i => [i.title, i.codepoint]))
) as Record<SidebarPages, string>;

export const PAGE_ICONS: Record<string, IconTypes> = Object.fromEntries(
    sidebarGroups.flatMap(g => g.items.map(i => [i.title, makeFontIcon(i.codepoint)]))
);

/** Sidebar `titleLabel`, keyed by `href` — lets a detail page's breadcrumb reuse the same label
 *  its sidebar button renders instead of re-deriving (and mistranslating) it from the URL. */
export const PAGE_TITLE_LABELS: Record<SidebarHrefs, Label> = Object.fromEntries(
    sidebarGroups.flatMap(g => g.items.map(i => [i.href, i.titleLabel]))
) as Record<SidebarHrefs, Label>;
