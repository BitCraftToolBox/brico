/** display-format.test.ts — filter/sort/render logic for watch display messages. */
import {MAX_DISPLAY_ROWS_HARD_CAP} from "@brico/crafts/discord-display";
import type {CraftSubject} from "@brico/crafts/filter";
import {matchAll} from "@brico/crafts/filter";
import type {
    APIActionRowComponent,
    APIButtonComponentWithURL,
    APIContainerComponent,
    APISectionComponent,
    APITextDisplayComponent,
    APIThumbnailComponent
} from "discord-api-types/v10";
import {ComponentType} from "discord-api-types/v10";
import assert from "node:assert/strict";
import {test} from "node:test";
import type {RecipeDisplayIndex} from "../game-data/recipes.ts";
import type {SkillNameIndex} from "../game-data/skills.ts";
import type {CraftRow} from "../relay/subject.ts";
import type {DiscordWatchDisplayContentValue} from "./display-format.ts";
import {buildDisplayComponents, maskInvisibleBounties, selectDisplayRows} from "./display-format.ts";

function subject(overrides: Partial<CraftSubject> = {}): CraftSubject {
    return {
        region: 14,
        claim: null,
        item: null,
        itemTag: null,
        inputItems: [],
        skill: null,
        buildingType: null,
        tier: 2,
        effortTotal: 100,
        effortRemaining: 40,
        public: true,
        complete: false,
        owner: null,
        ownerClaimAccess: null,
        payout: null,
        currency: null,
        bountyPrivate: false,
        ...overrides,
    };
}

function row(overrides: Partial<CraftRow> = {}): CraftRow {
    return {
        id: "1",
        regionId: 14,
        regionName: "Lumethis (R14)",
        recipeId: 7,
        count: 1,
        claimName: null,
        ownerName: null,
        firstSeenMs: 0n,
        subject: subject(),
        ...overrides,
    };
}

const PRESETS_CONTENT: DiscordWatchDisplayContentValue = {tag: "Presets", value: {presets: ["effortProgress"]}};
const BOT_HTTP_BASE_URL = "https://bot.brico.app";
const ASSET_CDN_BASE = "https://cdn.brico.app";
const FRONTEND_ORIGIN = "https://brico.app";
const NO_SKILLS: SkillNameIndex = new Map();

function build(
    content: DiscordWatchDisplayContentValue,
    style: "compact" | "simple" | "icon",
    rows: CraftRow[],
    totalMatches: number,
    recipeNames: RecipeDisplayIndex = new Map(),
    shareCode: string | undefined = undefined,
) {
    return buildDisplayComponents(
        "Open smithing work",
        content,
        style,
        rows,
        totalMatches,
        recipeNames,
        NO_SKILLS,
        FRONTEND_ORIGIN,
        BOT_HTTP_BASE_URL,
        ASSET_CDN_BASE,
        shareCode,
    );
}

test("maskInvisibleBounties leaves a public bounty untouched regardless of owner", () => {
    const rows = [row({id: "a", subject: subject({payout: 0.5, currency: "hex-coin", bountyPrivate: false})})];
    const masked = maskInvisibleBounties(rows, new Map(), "viewer-hex");
    assert.deepEqual(masked, rows);
});

test("maskInvisibleBounties leaves a private bounty untouched for its own owner", () => {
    const rows = [row({id: "a", subject: subject({payout: 0.5, currency: "hex-coin", bountyPrivate: true})})];
    const masked = maskInvisibleBounties(rows, new Map([["a", "viewer-hex"]]), "viewer-hex");
    assert.deepEqual(masked, rows);
});

test("maskInvisibleBounties hides a private bounty from anyone else, without dropping the craft row", () => {
    const rows = [row({id: "a", subject: subject({payout: 0.5, currency: "hex-coin", bountyPrivate: true})})];
    const masked = maskInvisibleBounties(rows, new Map([["a", "other-hex"]]), "viewer-hex");
    assert.equal(masked.length, 1);
    assert.equal(masked[0].id, "a");
    assert.equal(masked[0].subject.payout, null);
    assert.equal(masked[0].subject.currency, null);
    assert.equal(masked[0].subject.bountyPrivate, false);
});

test("maskInvisibleBounties hides a private bounty missing from the owner map (treated as not owned by the viewer)", () => {
    const rows = [row({id: "a", subject: subject({payout: 0.5, currency: "hex-coin", bountyPrivate: true})})];
    const masked = maskInvisibleBounties(rows, new Map(), "viewer-hex");
    assert.equal(masked[0].subject.payout, null);
});

test("selectDisplayRows filters, sorts ascending by remaining effort, and caps at limit", () => {
    const rows = [
        row({id: "a", subject: subject({effortRemaining: 30})}),
        row({id: "b", subject: subject({effortRemaining: 10})}),
        row({id: "c", subject: subject({effortRemaining: 20})}),
    ];
    const selected = selectDisplayRows(rows, matchAll(), "remaining", "asc", 2);
    assert.deepEqual(selected.rows.map(r => r.id), ["b", "c"]);
    assert.equal(selected.totalMatches, 3);
});

test("selectDisplayRows sorts descending when asked", () => {
    const rows = [
        row({id: "a", subject: subject({effortRemaining: 30})}),
        row({id: "b", subject: subject({effortRemaining: 10})}),
        row({id: "c", subject: subject({effortRemaining: 20})}),
    ];
    const selected = selectDisplayRows(rows, matchAll(), "remaining", "desc", 10);
    assert.deepEqual(selected.rows.map(r => r.id), ["a", "c", "b"]);
});

test("selectDisplayRows sorts by newest (firstSeen)", () => {
    const rows = [
        row({id: "old", firstSeenMs: 1000n}),
        row({id: "new", firstSeenMs: 5000n}),
        row({id: "mid", firstSeenMs: 3000n}),
    ];
    const selected = selectDisplayRows(rows, matchAll(), "newest", "desc", 10);
    assert.deepEqual(selected.rows.map(r => r.id), ["new", "mid", "old"]);
});

test("selectDisplayRows sorts by total effort", () => {
    const rows = [
        row({id: "small", subject: subject({effortTotal: 10})}),
        row({id: "big", subject: subject({effortTotal: 100})}),
    ];
    const selected = selectDisplayRows(rows, matchAll(), "effort", "asc", 10);
    assert.deepEqual(selected.rows.map(r => r.id), ["small", "big"]);
});

test("selectDisplayRows sorts by bounty, treating no-bounty as lowest", () => {
    const rows = [
        row({id: "none", subject: subject({payout: null})}),
        row({id: "low", subject: subject({payout: 0.1, currency: "hex-coin"})}),
        row({id: "high", subject: subject({payout: 0.9, currency: "hex-coin"})}),
    ];
    const selected = selectDisplayRows(rows, matchAll(), "bounty", "desc", 10);
    assert.deepEqual(selected.rows.map(r => r.id), ["high", "low", "none"]);
});

test("selectDisplayRows only returns rows the filter actually matches, and totalMatches reflects that too", () => {
    const rows = [row({id: "public", subject: subject({public: true})}), row({id: "private", subject: subject({public: false})})];
    const publicOnly = {field: "public" as const, cmp: "eq" as const, value: true};
    const selected = selectDisplayRows(rows, publicOnly, "newest", "asc", 10);
    assert.deepEqual(selected.rows.map(r => r.id), ["public"]);
    assert.equal(selected.totalMatches, 1);
});

test("buildDisplayComponents shows a placeholder text display for no matches", () => {
    const components = build(PRESETS_CONTENT, "compact", [], 0);
    const texts = components.filter((c): c is APITextDisplayComponent => c.type === ComponentType.TextDisplay);
    assert.ok(texts.some(t => t.content.includes("No matching crafts right now")));
});

test("buildDisplayComponents' header names the filter and reports the shown count", () => {
    const components = build(PRESETS_CONTENT, "compact", [row()], 1);
    const header = components[0] as APITextDisplayComponent;
    assert.equal(header.type, ComponentType.TextDisplay);
    assert.match(header.content, /Open smithing work/);
    assert.match(header.content, /1 craft shown/);
});

test("compact style joins every rendered row into one TextDisplay with no separators", () => {
    const components = build(PRESETS_CONTENT, "compact", [row({id: "a"}), row({id: "b"})], 2);
    assert.equal(components.length, 2);
    assert.equal(components.filter(c => c.type === ComponentType.Separator).length, 0);
    const body = components[1] as APITextDisplayComponent;
    assert.match(body.content, /tools\/crafts\/a/);
    assert.match(body.content, /tools\/crafts\/b/);
});

test("simple style wraps each row in a tier-accented Container, no separators", () => {
    const components = build(PRESETS_CONTENT, "simple", [row({id: "a", subject: subject({tier: 4})})], 1);
    const container = components.find((c): c is APIContainerComponent => c.type === ComponentType.Container)!;
    assert.ok(container, "expected a Container for the one matching row");
    assert.equal(container.accent_color, parseInt("49619C", 16));
    assert.equal(components.filter(c => c.type === ComponentType.Separator).length, 0);
});

test("simple style omits accent_color for an untiered craft", () => {
    const components = build(PRESETS_CONTENT, "simple", [row({subject: subject({tier: null})})], 1);
    const container = components.find((c): c is APIContainerComponent => c.type === ComponentType.Container)!;
    assert.equal(container.accent_color, undefined);
});

test("icon style renders one Section per row with an icon thumbnail, no separators", () => {
    const components = build(
        PRESETS_CONTENT,
        "icon",
        [row({id: "42", recipeId: 7, ownerName: "Alice", subject: subject({effortTotal: 100, effortRemaining: 40, tier: 3})})],
        1,
        new Map([[7, {name: "Plank", icon: {shape: "item" as const, id: 501}}]]),
    );
    const section = components.find((c): c is APISectionComponent => c.type === ComponentType.Section)!;
    assert.ok(section, "expected a Section component for the one matching row");
    const [text] = section.components;
    assert.match(text.content, /\*\*Plank \[↗]\(<https:\/\/brico\.app\/tools\/crafts\/42>\)\*\*/);
    assert.match(text.content, /Effort left:/);
    assert.equal(section.accessory.type, ComponentType.Thumbnail);
    assert.equal((section.accessory as APIThumbnailComponent).media.url, `${BOT_HTTP_BASE_URL}/icons/item/501.webp`);
    assert.equal(components.filter(c => c.type === ComponentType.Separator).length, 0);
});

test("icon style falls back to the CDN's generic Unknown sprite when a recipe's icon hasn't resolved", () => {
    const components = build(PRESETS_CONTENT, "icon", [row({recipeId: 7})], 1, new Map([[7, {name: "Plank", icon: null}]]));
    const section = components.find((c): c is APISectionComponent => c.type === ComponentType.Section)!;
    assert.equal((section.accessory as APIThumbnailComponent).media.url, `${ASSET_CDN_BASE}/sprites/Unknown.webp`);
});

test("icon style self-trims to the 40-component budget regardless of a display's stored limit", () => {
    const oversized = Array.from({length: MAX_DISPLAY_ROWS_HARD_CAP}, (_, i) => row({id: `r${i}`}));
    const components = build(PRESETS_CONTENT, "icon", oversized, oversized.length);
    const sectionCount = components.filter(c => c.type === ComponentType.Section).length;
    // header(1) + footer reserve(2) + 3/row <= 40 → floor(37/3) = 12
    assert.equal(sectionCount, 12);
    const header = components[0] as APITextDisplayComponent;
    assert.match(header.content, /12 crafts shown/);
});

test("simple style self-trims to the 40-component budget", () => {
    const oversized = Array.from({length: MAX_DISPLAY_ROWS_HARD_CAP}, (_, i) => row({id: `r${i}`}));
    const components = build(PRESETS_CONTENT, "simple", oversized, oversized.length);
    const containerCount = components.filter(c => c.type === ComponentType.Container).length;
    // header(1) + footer reserve(2) + 2/row <= 40 → floor(37/2) = 18
    assert.equal(containerCount, 18);
});

test("compact style self-trims by character count, never by component count", () => {
    const longTemplate: DiscordWatchDisplayContentValue = {tag: "Template", value: {template: "x".repeat(500)}};
    const many = Array.from({length: 20}, (_, i) => row({id: `r${i}`}));
    const components = build(longTemplate, "compact", many, many.length);
    assert.equal(components.length, 2);
    const body = components[1] as APITextDisplayComponent;
    assert.ok(body.content.length <= 4000);
    // Well under 20 rows worth (500 chars * 20 = 10000) fit in the 4000-char budget.
    assert.ok(body.content.split("\n").length < 20);
});

test("exactly one wasted render happens when the character budget (not the row count) is what cuts a display off", () => {
    let lookups = 0;
    const countingRecipeNames = {
        get(id: number) {
            lookups++;
            return undefined;
        },
    } as unknown as RecipeDisplayIndex;

    const longTemplate: DiscordWatchDisplayContentValue = {tag: "Template", value: {template: "x".repeat(500)}};
    const many = Array.from({length: 20}, (_, i) => row({id: `r${i}`}));
    const components = build(longTemplate, "compact", many, many.length, countingRecipeNames);
    const body = components[1] as APITextDisplayComponent;
    const shown = body.content.split("\n").length;

    assert.ok(shown < many.length, "expected the character budget to actually cut this display off");
    // One row past whatever fit gets rendered (to learn it doesn't fit) and discarded; nothing beyond
    // that is ever rendered, since the loop stops as soon as one row overflows the budget.
    assert.equal(lookups, shown + 1);
});

test("rows beyond what a style can ever show are never rendered at all, and at most one extra render is wasted when the character budget (not the component budget) is what cuts it off", () => {
    let lookups = 0;
    const countingRecipeNames = {
        get(id: number) {
            lookups++;
            return undefined;
        },
    } as unknown as RecipeDisplayIndex;

    const oversized = Array.from({length: MAX_DISPLAY_ROWS_HARD_CAP}, (_, i) => row({id: `r${i}`}));
    const components = build(PRESETS_CONTENT, "icon", oversized, oversized.length, countingRecipeNames);
    const shown = components.filter(c => c.type === ComponentType.Section).length;
    assert.equal(shown, 12); // same component-budget math as the "self-trims" test above

    // The component budget is checked before rendering, so only the rows shown are rendered.
    assert.equal(lookups, shown);
});

test("buildDisplayComponents omits the footer link when there is no shareCode", () => {
    const components = build(PRESETS_CONTENT, "compact", [row()], 1);
    assert.equal(components.some(c => c.type === ComponentType.ActionRow), false);
});

test("buildDisplayComponents appends a 'see all' footer button reporting the total match count, not just what's shown", () => {
    const components = build(PRESETS_CONTENT, "compact", [row()], 42, new Map(), "ABC123");
    const footer = components.at(-1) as APIActionRowComponent<APIButtonComponentWithURL>;
    assert.equal(footer.type, ComponentType.ActionRow);
    const [button] = footer.components;
    assert.equal(button.url, "https://brico.app/tools/crafts/browse?share=ABC123");
    assert.match(button.label ?? "", /See all 42 matching crafts/);
});

test("an arbitrary 'template' content variant renders directly, without going through field presets", () => {
    const template: DiscordWatchDisplayContentValue = {tag: "Template", value: {template: "custom: {username}"}};
    const components = build(template, "compact", [row({ownerName: "Bob"})], 1);
    const body = components[1] as APITextDisplayComponent;
    assert.equal(body.content, "custom: Bob");
});
