/**
 * display-format.ts — pure logic turning craft rows plus a watch display's config into Components V2
 * message components (styles `compact`, `simple`, `icon`). Rows render lazily until Discord's
 * 4000-character or 40-component message limits would be exceeded.
 */
import {composeTemplateFromPresets, type DiscordDisplaySortDirection, type DiscordDisplaySortField, type DiscordDisplayStyle,} from "@brico/crafts/discord-display";
import {renderDiscordTemplate} from "@brico/crafts/discord-template";
import type {FilterNode} from "@brico/crafts/filter";
import {tierColorHex} from "@brico/crafts/icon-render";
import type {APIActionRowComponent, APIButtonComponentWithURL, APIContainerComponent, APIMessageTopLevelComponent, APISectionComponent} from "discord-api-types/v10";
import {ButtonStyle, ComponentType} from "discord-api-types/v10";

import {compiledFilter} from "../compiled-filter.ts";
import type {RecipeDisplayIndex, RecipeDisplayInfo, RecipeIconRef} from "../game-data/recipes.ts";
import type {SkillNameIndex} from "../game-data/skills.ts";
import {type CraftRow, rowFor} from "../relay/subject.ts";

/** Generated-binding shape of `discord_watch_display.content` (enum tags are PascalCase client-side). */
export type DiscordWatchDisplayContentValue =
    | {tag: "Presets"; value: {presets: readonly string[]}}
    | {tag: "Template"; value: {template: string}};

function resolveTemplate(content: DiscordWatchDisplayContentValue): string {
    return content.tag === "Presets" ? composeTemplateFromPresets(content.value.presets) : content.value.template;
}

function compareAscending(field: DiscordDisplaySortField): (a: CraftRow, b: CraftRow) => number {
    switch (field) {
        case "remaining":
            return (a, b) => a.subject.effortRemaining - b.subject.effortRemaining;
        case "effort":
            return (a, b) => a.subject.effortTotal - b.subject.effortTotal;
        case "tier":
            return (a, b) => (a.subject.tier ?? -Infinity) - (b.subject.tier ?? -Infinity);
        case "bounty":
            return (a, b) => (a.subject.payout ?? -Infinity) - (b.subject.payout ?? -Infinity);
        case "newest":
            // The difference of two unix-ms values is exact in a float64.
            return (a, b) => Number(a.firstSeenMs - b.firstSeenMs);
        default: {
            const exhaustive: never = field;
            throw new Error(`unhandled sort field: ${exhaustive as string}`);
        }
    }
}

export interface DisplaySelection {
    /** The rows to actually render, after sorting and capping at `limit`. */
    rows: CraftRow[];
    /** Rows matched before capping at `limit` (the footer link's count). */
    totalMatches: number;
}

/**
 * Filters `rows` by `filter` as seen by `viewerAccountHex` (a private bounty is invisible to
 * everyone but its assigner, for matching, sorting and rendering alike), sorts them, and caps at `limit`.
 */
export function selectDisplayRows(
    rows: readonly CraftRow[],
    filter: FilterNode,
    viewerAccountHex: string | null,
    sortField: DiscordDisplaySortField,
    sortDirection: DiscordDisplaySortDirection,
    limit: number,
): DisplaySelection {
    const ascending = compareAscending(sortField);
    const compare = sortDirection === "desc" ? (a: CraftRow, b: CraftRow) => -ascending(a, b) : ascending;
    const test = compiledFilter(filter);
    const matches: CraftRow[] = [];
    for (const row of rows) {
        const visible = rowFor(row, viewerAccountHex);
        if (test(visible.subject)) matches.push(visible);
    }
    matches.sort(compare);
    return {rows: matches.slice(0, limit), totalMatches: matches.length};
}

/** Displays ping nobody, so `mentionText` is null. */
function templateContextFor(row: CraftRow, info: RecipeDisplayInfo | undefined, skillNames: SkillNameIndex, frontendOrigin: string, filterName: string) {
    return {
        recipeName: info?.name ?? `Recipe #${row.recipeId}`,
        craftId: row.id,
        frontendOrigin,
        ownerName: row.ownerName,
        claimName: row.claimName,
        regionId: row.regionId,
        tier: row.subject.tier,
        skillName: row.subject.skill !== null ? (skillNames.get(row.subject.skill) ?? null) : null,
        effortTotal: row.subject.effortTotal,
        effortRemaining: row.subject.effortRemaining,
        payout: row.subject.payout,
        currency: row.subject.currency,
        filterName,
        mentionText: null,
    };
}

/** One row's rendered text plus its recipe info (reused for the `icon` style's thumbnail). */
function renderRow(
    row: CraftRow,
    template: string,
    recipeNames: RecipeDisplayIndex,
    skillNames: SkillNameIndex,
    frontendOrigin: string,
    filterName: string,
): {text: string; info: RecipeDisplayInfo | undefined} {
    const info = recipeNames.get(row.recipeId);
    return {text: renderDiscordTemplate(template, templateContextFor(row, info, skillNames, frontendOrigin, filterName)), info};
}

/** Icon URL from the bot's `/icons/:shape/:id.webp` route, or the CDN's "Unknown" sprite when the recipe has no output. */
function iconUrlFor(icon: RecipeIconRef | null, botHttpBaseUrl: string, assetCdnBase: string): string {
    if (!icon) return `${assetCdnBase}/sprites/Unknown.webp`;
    return `${botHttpBaseUrl}/icons/${icon.shape}/${icon.id}.webp`;
}

function hexToAccentColor(hex: string): number {
    return parseInt(hex.slice(1), 16);
}

function headerText(filterName: string, shownCount: number): string {
    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    return `**Craft watch: ${filterName}**\nUpdated <t:${nowUnixSeconds}:R> • ${shownCount} craft${shownCount === 1 ? "" : "s"} shown`;
}

function footerLabel(totalMatches: number): string {
    return `See all ${totalMatches} matching craft${totalMatches === 1 ? "" : "s"}`;
}

function footerButton(frontendOrigin: string, shareCode: string, totalMatches: number): APIActionRowComponent<APIButtonComponentWithURL> {
    return {
        type: ComponentType.ActionRow,
        components: [{
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            url: `${frontendOrigin}/tools/crafts/browse?share=${shareCode}`,
            label: footerLabel(totalMatches),
        }],
    };
}

/** Discord's per-message limits (characters across text components; total components). */
const MESSAGE_CHAR_BUDGET = 4000;
const MESSAGE_COMPONENT_BUDGET = 40;
const HEADER_COMPONENTS = 1;
/** `compact` style's row separator; its length is counted in the character budget. */
const ROW_SEPARATOR = "\n";
/** Reserved even without a `shareCode`, so the budget doesn't depend on the footer link. */
const FOOTER_COMPONENTS_RESERVED = 2;
const SIMPLE_COMPONENTS_PER_ROW = 2; // Container + TextDisplay
const ICON_COMPONENTS_PER_ROW = 3; // Section + TextDisplay + Thumbnail

/**
 * The `components` array for a watch display; send with `flags: MessageFlags.IsComponentsV2` and no
 * `embeds`/`content`. `frontendOrigin` is the web app origin the row and footer links point into;
 * `botHttpBaseUrl`/`assetCdnBase` build icon URLs (`icon` style). The footer link is omitted when
 * `shareCode` is undefined.
 */
export function buildDisplayComponents(
    filterName: string,
    content: DiscordWatchDisplayContentValue,
    style: DiscordDisplayStyle,
    rows: readonly CraftRow[],
    totalMatches: number,
    recipeNames: RecipeDisplayIndex,
    skillNames: SkillNameIndex,
    frontendOrigin: string,
    botHttpBaseUrl: string,
    assetCdnBase: string,
    shareCode: string | undefined,
): APIMessageTopLevelComponent[] {
    if (rows.length === 0) {
        return [
            {type: ComponentType.TextDisplay, content: headerText(filterName, 0)},
            {type: ComponentType.TextDisplay, content: "_No matching crafts right now._"},
        ];
    }

    const template = resolveTemplate(content);

    // `rows.length` bounds the shown count, so this reserve is >= the final header's length.
    const headerReserve = headerText(filterName, rows.length).length;
    const footerReserve = shareCode !== undefined ? footerLabel(totalMatches).length : 0;

    let shown: number;
    let rowComponents: APIMessageTopLevelComponent[];

    // Rows render lazily: the component budget is checked before rendering a row, the character
    // budget after, so at most one row per render is rendered and discarded.
    if (style === "compact") {
        let used = headerReserve + footerReserve;
        const included: string[] = [];
        for (const row of rows) {
            const {text} = renderRow(row, template, recipeNames, skillNames, frontendOrigin, filterName);
            const addition = (included.length > 0 ? ROW_SEPARATOR.length : 0) + text.length;
            if (used + addition > MESSAGE_CHAR_BUDGET) break;
            included.push(text);
            used += addition;
        }
        shown = included.length;
        rowComponents = shown > 0 ? [{type: ComponentType.TextDisplay, content: included.join(ROW_SEPARATOR)}] : [];
    } else if (style === "simple") {
        let usedChars = headerReserve + footerReserve;
        let usedComponents = HEADER_COMPONENTS + FOOTER_COMPONENTS_RESERVED;
        const containers: APIContainerComponent[] = [];
        for (const row of rows) {
            if (usedComponents + SIMPLE_COMPONENTS_PER_ROW > MESSAGE_COMPONENT_BUDGET) break;
            const {text} = renderRow(row, template, recipeNames, skillNames, frontendOrigin, filterName);
            if (usedChars + text.length > MESSAGE_CHAR_BUDGET) break;
            const tier = row.subject.tier;
            containers.push({
                type: ComponentType.Container,
                accent_color: tier !== null ? hexToAccentColor(tierColorHex(tier)) : undefined,
                components: [{type: ComponentType.TextDisplay, content: text}],
            });
            usedChars += text.length;
            usedComponents += SIMPLE_COMPONENTS_PER_ROW;
        }
        shown = containers.length;
        rowComponents = containers;
    } else {
        let usedChars = headerReserve + footerReserve;
        let usedComponents = HEADER_COMPONENTS + FOOTER_COMPONENTS_RESERVED;
        const sections: APISectionComponent[] = [];
        for (const row of rows) {
            if (usedComponents + ICON_COMPONENTS_PER_ROW > MESSAGE_COMPONENT_BUDGET) break;
            const {text, info} = renderRow(row, template, recipeNames, skillNames, frontendOrigin, filterName);
            if (usedChars + text.length > MESSAGE_CHAR_BUDGET) break;
            sections.push({
                type: ComponentType.Section,
                components: [{type: ComponentType.TextDisplay, content: text}],
                accessory: {
                    type: ComponentType.Thumbnail,
                    media: {url: iconUrlFor(info?.icon ?? null, botHttpBaseUrl, assetCdnBase)},
                    description: info?.name ?? `Recipe #${row.recipeId}`,
                },
            });
            usedChars += text.length;
            usedComponents += ICON_COMPONENTS_PER_ROW;
        }
        shown = sections.length;
        rowComponents = sections;
    }

    const header: APIMessageTopLevelComponent = {type: ComponentType.TextDisplay, content: headerText(filterName, shown)};
    if (shown === 0) {
        return [header, {type: ComponentType.TextDisplay, content: "_Nothing fit in this message — try fewer field presets or a smaller style._"}];
    }

    const components = [header, ...rowComponents];
    if (shareCode !== undefined) components.push(footerButton(frontendOrigin, shareCode, totalMatches));
    return components;
}
