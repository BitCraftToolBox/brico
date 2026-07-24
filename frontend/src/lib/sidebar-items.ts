/**
 * sidebar-items.ts — Static data for sidebar navigation groups.
 *
 * Extracted here (rather than living in app-sidebar.tsx) so that:
 *  - settings.tsx can derive ALL_SIDEBAR_HREFS for the favorites feature
 *  - app-sidebar.tsx still owns rendering/behavior
 */
import {type IconTypes} from "solid-icons";
import {makeFontIcon} from "~/components/icons/font-icons";

export type SidebarItemDef = {
    title: string
    href: string
    icon: IconTypes
    disabled?: boolean
}

export type SidebarGroupDef = {
    name: string
    items: SidebarItemDef[]
}

// Each item carries its font-icon `codepoint` (single source); the runtime `icon` component and
// the OG-image codepoint lookup (PAGE_ICON_CODEPOINTS) are both derived from it below.
const sidebarGroups = [
    {
        name: "Compendium",
        items: [
            {href: '/database/item',        title: 'Items',      codepoint: "FFFB"},
            {href: '/database/cargo',       title: 'Cargo',      codepoint: "FFF4"},
            {href: '/database/creature',    title: 'Creatures',  codepoint: "FFF7"},
            {href: '/database/resource',    title: 'Resources',  codepoint: "FFFE"},
            {href: '/database/building',    title: 'Structures', codepoint: "FFF3"},
            {href: '/database/collectible', title: 'Collection', codepoint: "FFD9"},
            {href: '/database/knowledge',   title: 'Knowledge',  codepoint: "FFFC"},
        ] as const
    },
    {
        name: "Item Details",
        items: [
            {href: '/database/food',      title: 'Food',       codepoint: "008A"},
            {href: '/database/tool',      title: 'Tools',      codepoint: "0086"},
            {href: '/database/weapon',    title: 'Weapons',    codepoint: "FFAE"},
            {href: '/database/equipment', title: 'Equipment',  codepoint: "FFE2"},
            {href: '/database/item-list', title: 'Item Lists', codepoint: "0112"},
        ] as const
    },
    {
        name: "Progression",
        items: [
            {href: '/database/achievement',   title: 'Achievements',   codepoint: "FFE3"},
            {href: '/database/claim-research', title: 'Claim Research', codepoint: "FFDF"},
            {href: '/database/quest-chain',   title: 'Quest Chains',   codepoint: "0107"},
            {href: '/database/skill',         title: 'Skills',         codepoint: "FFF2"},
        ] as const
    },
    {
        name: "Character",
        items: [
            {href: '/database/deployable', title: 'Deployables',      codepoint: "FFD4"},
            {href: '/database/placeable',  title: 'Placeables',       codepoint: "0072"},
            {href: '/database/combat',     title: 'Combat Abilities', codepoint: "FFC3"},
            {href: '/database/buff',       title: 'Buffs',            codepoint: "FFD0"},
        ] as const
    },
    {
        name: "World",
        items: [
            {href: '/database/traveler-task',  title: 'Traveler Tasks',  codepoint: "FFFF"},
            {href: '/database/traveler-trade', title: 'Traveler Trades', codepoint: "008E"},
            {href: '/database/prospecting',    title: 'Prospecting',     codepoint: "FFB0"},
            {href: '/database/biome',          title: 'Biomes',          codepoint: "FFF1"},
            {href: '/database/paving',         title: 'Paving',          codepoint: "0041"},
            {href: '/database/terraforming',   title: 'Terraforming',    codepoint: "0034"},
        ] as const
    },
    {
        name: "Toolbox",
        items: [
            {href: '/tools/emblem', title: 'Emblem Editor', codepoint: "FFB7"},
            {href: '/events', title: 'Event Timers', codepoint: "FFFE"},
            {href: '/tools/placeable-graph', title: 'Placeable Graph', codepoint: "0072"},
            {href: '/tools/quest-graph', title: 'Quest Graph', codepoint: "0107"},
        ] as const
    },
] as const;

export type SidebarPages = typeof sidebarGroups[number]["items"][number]["title"];

export const SIDEBAR_GROUPS: SidebarGroupDef[] = sidebarGroups.map(g => ({
    name: g.name,
    items: g.items.map(i => ({title: i.title, href: i.href, icon: makeFontIcon(i.codepoint)})),
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