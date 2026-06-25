/**
 * game-links.tsx — Reusable rich link/label components for game entities.
 *
 * Provides inline link elements with icons for skills, knowledge, buffs,
 * biomes, achievements, tools, quest chains, items, collectibles,
 * and page section headings.
 *
 * Used in:
 *   - Detail page group headings (icon + linked heading text)
 *   - Table cells (linked names instead of plain text)
 *   - Stat lines (icon in label, linked name in value)
 */

import {A} from "@solidjs/router";
import {TbOutlineLock as IconLock} from "solid-icons/tb";
import {For, JSX, Show} from "solid-js";
import {ItemStack} from "~/bindings/src/item_stack_type";
import {ItemType} from "~/bindings/src/item_type_type";
import {SkillDesc} from "~/bindings/src/skill_desc_type";
import {FontIcon} from "~/components/icons/font-icons";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {PAGE_ICONS, SidebarPages} from "~/lib/sidebar-items";
import {BitCraftTables} from "~/lib/spacetime";
import {cn, fixFloat, readableSeconds} from "~/lib/utils";

// ─── Constants ──────────────────────────────────────────────────

const AOC_ID = 12345; // "Art of Cheating" knowledge ID — used to flag dev-locked entries

// ─── Low-level link primitives ──────────────────────────────────

/** Inline link with optional leading icon */
export function IconLink(props: {
    href: string;
    icon?: JSX.Element;
    children: JSX.Element;
    class?: string;
}) {
    return (
        <A href={props.href} class={cn("inline-flex flex-nowrap text-nowrap items-center gap-1 hover:underline", props.class)}>
            {props.icon}
            {props.children}
        </A>
    );
}

/** Inline non-link wrapper with optional leading icon — same layout as IconLink but renders a span. */
export function IconSpan(props: {
    icon?: JSX.Element;
    children: JSX.Element;
    class?: string;
}) {
    return (
        <span class={cn("inline-flex flex-nowrap text-nowrap items-center gap-1", props.class)}>
            {props.icon}
            {props.children}
        </span>
    );
}

// ─── Page icon helper ───────────────────────────────────────────

/** Returns a page icon element by page title (from sidebar-items). */
export function pageIcon(pageTitle: SidebarPages, iconClass: string = "size-4 shrink-0 align-text-bottom"): JSX.Element | undefined {
    const icon = PAGE_ICONS[pageTitle];
    if (!icon) return undefined;
    return icon({class: iconClass});
}

// ─── Skill ──────────────────────────────────────────────────────

/** Renders a skill name as a link with the skill's icon. */
export function SkillLink(props: { skill: SkillDesc; class?: string; showIcon?: boolean; level?: string }) {
    const show = () => props.showIcon !== false;
    // overwrite "ANY" skill icon with tools icon. better than a square at least. might still change this
    const codepoint = () => props.skill.name === "ANY" ? "0086" : props.skill.iconAssetName;
    return (
        <IconLink
            href={`/database/skill/${props.skill.id}`}
            icon={show() ? <FontIcon codepoint={codepoint()} class="size-4 shrink-0 align-text-bottom"/> : undefined}
            class={props.class}
        >
            {props.skill.name} {props.level ? <span class={"text-muted-foreground"}>{props.level}</span> : null}
        </IconLink>
    );
}

/** Resolves a skill ID to a SkillLink, or falls back to plain text. */
export function SkillLinkById(props: { skillId: number; class?: string; showIcon?: boolean; level?: string }) {
    const skill = () => BitCraftTables.SkillDesc.indexedBy("id")()?.get(props.skillId);
    return (
        <Show when={skill()} fallback={<span>Skill #{props.skillId}</span>}>
            {s => <SkillLink skill={s()} class={props.class} showIcon={props.showIcon} level={props.level}/>}
        </Show>
    );
}

// ─── Knowledge ──────────────────────────────────────────────────

/** Renders a knowledge entry as a link, with a lock tooltip if it's the AOC dev-locked ID. */
export function KnowledgeLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    const isDevLocked = () => props.id === AOC_ID;
    return (
        <Tooltip disabled={!isDevLocked()}>
            <TooltipTrigger
                as={A}
                href={`/database/knowledge/${props.id}`}
                class={cn("inline-flex items-center gap-1 hover:underline", props.class)}
            >
                <Show when={show()}>
                    {pageIcon("Knowledge")}
                </Show>
                {props.name ?? `Knowledge #${props.id}`}
                <Show when={isDevLocked()}>
                    <IconLock class="size-3 text-destructive shrink-0"/>
                </Show>
            </TooltipTrigger>
            <TooltipContent class="max-w-[90svw]">Developer-locked / inaccessible</TooltipContent>
        </Tooltip>
    );
}

/** Resolves a knowledge ID to a KnowledgeLink. */
export function KnowledgeLinkById(props: { id: number; class?: string; showIcon?: boolean }) {
    const knowledge = () => BitCraftTables.SecondaryKnowledgeDesc.indexedBy("id")()?.get(props.id);
    return <KnowledgeLink id={props.id} name={knowledge()?.name} class={props.class} showIcon={props.showIcon}/>;
}

// ─── Buff ───────────────────────────────────────────────────────

/** Renders a buff description as a link. */
export function BuffLink(props: { buffId: number; label?: string; class?: string; showIcon?: boolean, duration?: number }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/buff/${props.buffId}`}
            icon={show() ? pageIcon("Buffs") : undefined}
            class={props.class}
        >
            {props.label ?? `Buff #${props.buffId}`} {props.duration ? <span class={"text-muted-foreground"}>{readableSeconds(fixFloat(props.duration))}</span> : null}
        </IconLink>
    );
}

export function BuffLinkById(props: { buffId: number; class?: string; showIcon?: boolean, duration?: number }) {
    const buff = () => BitCraftTables.BuffDesc.indexedBy("id")()?.get(props.buffId);
    return <BuffLink buffId={props.buffId} label={buff()?.description} class={props.class} showIcon={props.showIcon} duration={props.duration ?? buff()?.duration ?? undefined}/>;
}

// ─── Building ───────────────────────────────────────────────────

/** Renders a building name as a link. */
export function BuildingLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/building/${props.id}`}
            icon={show() ? pageIcon("Structures") : undefined}
            class={props.class}
        >
            {props.name ?? `Building #${props.id}`}
        </IconLink>
    );
}

/** Resolves a building ID to a BuildingLink. */
export function BuildingLinkById(props: { id: number; class?: string; showIcon?: boolean }) {
    const building = () => BitCraftTables.BuildingDesc.indexedBy("id")()?.get(props.id);
    return <BuildingLink id={props.id} name={building()?.name} class={props.class} showIcon={props.showIcon}/>;
}

// ─── Achievement ────────────────────────────────────────────────

/** Renders an achievement name as a link. */
export function AchievementLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/achievement/${props.id}`}
            icon={show() ? pageIcon("Achievements") : undefined}
            class={props.class}
        >
            {props.name ?? `Achievement #${props.id}`}
        </IconLink>
    );
}

// ─── Biome ──────────────────────────────────────────────────────

/** Renders a biome name as a link. */
export function BiomeLink(props: { biomeType: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/biome/${props.biomeType}`}
            icon={show() ? pageIcon("Biomes") : undefined}
            class={props.class}
        >
            {props.name ?? `Biome #${props.biomeType}`}
        </IconLink>
    );
}

// ─── Quest Chain ────────────────────────────────────────────────

/** Renders a quest chain name as a link. */
export function QuestChainLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/quest-chain/${props.id}`}
            icon={show() ? pageIcon("Quest Chains") : undefined}
            class={props.class}
        >
            {props.name ?? `Quest #${props.id}`}
        </IconLink>
    );
}

/** Resolves a quest chain ID to a QuestChainLink. */
export function QuestChainLinkById(props: { id: number; class?: string; showIcon?: boolean }) {
    const quest = () => BitCraftTables.QuestChainDesc.indexedBy("id")()?.get(props.id);
    return <QuestChainLink id={props.id} name={quest()?.name} class={props.class} showIcon={props.showIcon}/>;
}

// ─── Collectible ────────────────────────────────────────────────

/** Renders a collectible name as a link. */
export function CollectibleLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/collectible/${props.id}`}
            icon={show() ? pageIcon("Collection") : undefined}
            class={props.class}
        >
            {props.name ?? `Collectible #${props.id}`}
        </IconLink>
    );
}

/** Resolves a collectible ID to a CollectibleLink. */
export function CollectibleLinkById(props: { id: number; class?: string; showIcon?: boolean }) {
    const col = () => BitCraftTables.CollectibleDesc.indexedBy("id")()?.get(props.id);
    return <CollectibleLink id={props.id} name={col()?.name} class={props.class} showIcon={props.showIcon}/>;
}

// ─── Placeable ──────────────────────────────────────────────────

/** Renders a placeable name as a link. */
export function PlaceableLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/placeable/${props.id}`}
            icon={show() ? pageIcon("Placeables") : undefined}
            class={props.class}
        >
            {props.name ?? `Placeable #${props.id}`}
        </IconLink>
    );
}

/** Resolves a placeable ID to a PlaceableLink. */
export function PlaceableLinkById(props: { id: number; class?: string; showIcon?: boolean }) {
    const plc = () => BitCraftTables.PlaceableDesc.indexedBy("id")()?.get(props.id);
    return <PlaceableLink id={props.id} name={plc()?.name} class={props.class} showIcon={props.showIcon}/>;
}

// ─── Item ────────────────────────────────────────────────────────

/** Renders an item name as a link. */
export function ItemLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/item/${props.id}`}
            icon={show() ? pageIcon("Items") : undefined}
            class={props.class}
        >
            {props.name ?? `Item #${props.id}`}
        </IconLink>
    );
}

export function CargoLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/cargo/${props.id}`}
            icon={show() ? pageIcon("Cargo") : undefined}
            class={props.class}
        >
            {props.name ?? `Cargo #${props.id}`}
        </IconLink>
    );
}

// ─── Item List ───────────────────────────────────────────────────

/** Renders an item list name as a link. */
export function ItemListLink(props: { id: number; name?: string; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    return (
        <IconLink
            href={`/database/item-list/${props.id}`}
            icon={show() ? pageIcon("Item Lists") : undefined}
            class={props.class}
        >
            {props.name ?? `Item List #${props.id}`}
        </IconLink>
    );
}

// ─── Combat Action ───────────────────────────────────────────────

/**
 * Renders a combat action name as a link, with the action's own font icon if provided,
 * falling back to the Combat Abilities page icon.
 */
export function CombatActionLink(props: { id: number; name?: string; codepoint?: string; class?: string }) {
    const icon = () => props.codepoint
        ? <FontIcon codepoint={props.codepoint} class="size-4 shrink-0 align-text-bottom"/>
        : pageIcon("Combat Abilities");
    return (
        <IconLink href={`/database/combat/${props.id}`} icon={icon()} class={props.class}>
            {props.name ?? `Combat Action #${props.id}`}
        </IconLink>
    );
}

// ─── Item Stack (lightweight) ───────────────────────────────────

/**
 * Renders an item or cargo stack as a page-icon + name + quantity link.
 * This is a lightweight text-based link, NOT the full graphical GameIcon.
 */
export function ItemStackLink(props: { stack: ItemStack; class?: string; showIcon?: boolean }) {
    const show = () => props.showIcon !== false;
    const isCargo = () => props.stack.itemType.tag === ItemType.Cargo.tag;

    const name = () => {
        if (isCargo()) {
            return BitCraftTables.CargoDesc.indexedBy("id")()?.get(props.stack.itemId)?.name ?? `Cargo #${props.stack.itemId}`;
        }
        return BitCraftTables.ItemDesc.indexedBy("id")()?.get(props.stack.itemId)?.name ?? `Item #${props.stack.itemId}`;
    };

    const href = () => isCargo()
        ? `/database/cargo/${props.stack.itemId}`
        : `/database/item/${props.stack.itemId}`;

    const iconEl = () => {
        if (!show()) return undefined;
        return isCargo() ? pageIcon("Cargo") : pageIcon("Items");
    };

    return (
        <IconLink href={href()} icon={iconEl()} class={props.class}>
            {name()}
            <Show when={props.stack.quantity > 1}>
                <span class="text-muted-foreground">×{props.stack.quantity}</span>
            </Show>
        </IconLink>
    );
}

// ─── List renderers (for table cells) ───────────────────────────

/** Renders a list of elements separated by commas. Handles wrapping cleanly. */
export function LinkedList(props: { children: JSX.Element[] }) {
    return (
        <span class="inline-flex flex-wrap items-center">
            <For each={props.children}>
                {(child, i) => (
                    <span class="text-nowrap">
                        {child}
                        <Show when={i() < props.children.length - 1}>
                            <span class="text-muted-foreground mr-1 align-bottom">,</span>
                        </Show>
                    </span>
                )}
            </For>
        </span>
    );
}

// ─── Stat-line icon helpers ─────────────────────────────────────

/** Returns a skill icon element for use in stat line labels. */
export function skillStatIcon(skill: SkillDesc | undefined): JSX.Element {
    if (!skill) return <></>;
    return <FontIcon codepoint={skill.iconAssetName} class="size-4 shrink-0 inline align-text-bottom"/>;
}

/** Returns a tool icon element for use in stat line labels. */
export function toolStatIcon(): JSX.Element {
    const icon = PAGE_ICONS["Tools"];
    if (!icon) return <></>;
    return icon({class: "size-4 shrink-0 inline align-text-bottom"});
}

/** Returns a knowledge icon element for use in stat line labels. */
export function knowledgeStatIcon(): JSX.Element {
    const icon = PAGE_ICONS["Knowledge"];
    if (!icon) return <></>;
    return icon({class: "size-4 shrink-0 inline align-text-bottom"});
}


export function breadcrumb(href: string, title?: string): JSX.Element {
    title = title ?? href
        .split("/").pop()
        ?.replace(/(-[a-z])/g, c => " " + c[1].toUpperCase())
        .replace(/^\w/, c => c.toUpperCase());
    if (!title) return <></>;
    return <>
        <A href={href}>{title}</A><span class="mx-1.5">{">"}</span>
    </>;
}