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

const sidebarGroups = [
    {
        name: "Compendium",
        items: [
            {href: '/database/item',        title: 'Items',      icon: makeFontIcon("FFFB")},
            {href: '/database/cargo',       title: 'Cargo',      icon: makeFontIcon("FFF4")},
            {href: '/database/creature',    title: 'Creatures',  icon: makeFontIcon("FFF7")},
            {href: '/database/resource',    title: 'Resources',  icon: makeFontIcon("FFFE")},
            {href: '/database/building',    title: 'Structures', icon: makeFontIcon("FFF3")},
            {href: '/database/collectible', title: 'Collection', icon: makeFontIcon("FFD9")},
            {href: '/database/knowledge',   title: 'Knowledge',  icon: makeFontIcon("FFFC")},
        ] as const
    },
    {
        name: "Item Details",
        items: [
            {href: '/database/food',      title: 'Food',       icon: makeFontIcon("008A")},
            {href: '/database/tool',      title: 'Tools',      icon: makeFontIcon("0086")},
            {href: '/database/weapon',    title: 'Weapons',    icon: makeFontIcon("FFAE")},
            {href: '/database/equipment', title: 'Equipment',  icon: makeFontIcon("FFE2")},
            {href: '/database/item-list', title: 'Item Lists', icon: makeFontIcon("0112")},
        ] as const
    },
    {
        name: "Progression",
        items: [
            {href: '/database/achievement',   title: 'Achievements',   icon: makeFontIcon("FFE3")},
            {href: '/database/claim-research', title: 'Claim Research', icon: makeFontIcon("FFDF")},
            {href: '/database/quest-chain',   title: 'Quest Chains',   icon: makeFontIcon("0107")},
            {href: '/database/skill',         title: 'Skills',         icon: makeFontIcon("FFF2")},
        ] as const
    },
    {
        name: "Character",
        items: [
            {href: '/database/deployable', title: 'Deployables',      icon: makeFontIcon("FFD4")},
            {href: '/database/placeable',  title: 'Placeables',       icon: makeFontIcon("0072")},
            {href: '/database/combat',     title: 'Combat Abilities', icon: makeFontIcon("FFC3")},
            {href: '/database/buff',       title: 'Buffs',            icon: makeFontIcon("FFD0")},
        ] as const
    },
    {
        name: "World",
        items: [
            {href: '/database/traveler-task',  title: 'Traveler Tasks',  icon: makeFontIcon("FFFF")},
            {href: '/database/traveler-trade', title: 'Traveler Trades', icon: makeFontIcon("008E")},
            {href: '/database/prospecting',    title: 'Prospecting',     icon: makeFontIcon("FFB0")},
            {href: '/database/biome',          title: 'Biomes',          icon: makeFontIcon("FFF1")},
            {href: '/database/paving',         title: 'Paving',          icon: makeFontIcon("0041")},
        ] as const
    },
    {
        name: "Toolbox",
        items: [
            {href: '/tools/emblem', title: 'Emblem Editor', icon: makeFontIcon("FFB7")},
            {href: '/tools/placeable-graph', title: 'Placeable Graph', icon: makeFontIcon("0072")},
            {href: '/tools/quest-graph', title: 'Quest Graph', icon: makeFontIcon("0107")},
        ] as const
    },
] as const;

export const SIDEBAR_GROUPS = sidebarGroups as unknown as SidebarGroupDef[]; // this is what it internally is before we const everything
export type SidebarPages = typeof sidebarGroups[number]["items"][number]["title"];

/** Flat list of all sidebar hrefs — used by settings to derive favorites. */
export const ALL_SIDEBAR_HREFS: string[] = sidebarGroups.flatMap(g => g.items.map(i => i.href));

export const PAGE_ICONS: Record<string, IconTypes> = Object.fromEntries(sidebarGroups.flatMap(g => g.items.map(i => [i.title, i.icon])));