/**
 * Closed vocabularies for a Discord watch display's style/sort/content config, shared by
 * `backend/brico-module` (write-time validation) and `backend/brico-bot` (rendering).
 */

export const DISCORD_DISPLAY_STYLES = ["compact", "simple", "icon"] as const;
export type DiscordDisplayStyle = (typeof DISCORD_DISPLAY_STYLES)[number];

export function isDiscordDisplayStyle(value: string): value is DiscordDisplayStyle {
    return (DISCORD_DISPLAY_STYLES as readonly string[]).includes(value);
}

export const DISCORD_DISPLAY_STYLE_LABELS: Record<DiscordDisplayStyle, string> = {
    compact: "Compact (one block of text)",
    simple: "Simple (tier-colored cards)",
    icon: "Icon (cards with item icons)",
};

export const DISCORD_DISPLAY_SORT_FIELDS = ["remaining", "effort", "tier", "bounty", "newest"] as const;
export type DiscordDisplaySortField = (typeof DISCORD_DISPLAY_SORT_FIELDS)[number];

export function isDiscordDisplaySortField(value: string): value is DiscordDisplaySortField {
    return (DISCORD_DISPLAY_SORT_FIELDS as readonly string[]).includes(value);
}

export const DISCORD_DISPLAY_SORT_FIELD_LABELS: Record<DiscordDisplaySortField, string> = {
    remaining: "Effort remaining",
    effort: "Total effort",
    tier: "Tier",
    bounty: "Bounty rate",
    newest: "Newest",
};

export const DISCORD_DISPLAY_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type DiscordDisplaySortDirection = (typeof DISCORD_DISPLAY_SORT_DIRECTIONS)[number];

export function isDiscordDisplaySortDirection(value: string): value is DiscordDisplaySortDirection {
    return (DISCORD_DISPLAY_SORT_DIRECTIONS as readonly string[]).includes(value);
}

export const DISCORD_DISPLAY_SORT_DIRECTION_LABELS: Record<DiscordDisplaySortDirection, string> = {
    asc: "Ascending (lowest first)",
    desc: "Descending (highest first)",
};

/**
 * Selectable template lines. A composed template always starts with `**{craft:name} {link}**`, then
 * one line per selected preset in this object's key order (the canonical order, regardless of the
 * order stored in a display's `presets`).
 */
export const DISCORD_DISPLAY_FIELD_PRESETS = {
    ownerLocation: {label: "Owner/Location", templateLine: "{username} · {claim} {region:short}"},
    tierSkill: {label: "Tier/Skill", templateLine: "{tier:short} {skill}"},
    effortProgress: {label: "Effort/Progress", templateLine: "Effort left: {remaining:short} · {progress:percent} done"},
    bountyPayout: {label: "Bounty/Payout", templateLine: "Bounty: {bounty:effort} · {payout:remaining} left"},
} satisfies Record<string, {label: string; templateLine: string}>;

export const DISCORD_DISPLAY_FIELD_PRESET_KEYS = Object.keys(DISCORD_DISPLAY_FIELD_PRESETS) as DiscordDisplayFieldPresetKey[];

export type DiscordDisplayFieldPresetKey = keyof typeof DISCORD_DISPLAY_FIELD_PRESETS;

export function isDiscordDisplayFieldPresetKey(value: string): value is DiscordDisplayFieldPresetKey {
    return Object.prototype.hasOwnProperty.call(DISCORD_DISPLAY_FIELD_PRESETS, value);
}

/** Builds a display's per-craft template from its selected presets, in canonical preset order. */
export function composeTemplateFromPresets(presets: readonly string[]): string {
    const selected = new Set(presets);
    const lines = DISCORD_DISPLAY_FIELD_PRESET_KEYS
        .filter(key => selected.has(key))
        .map(key => DISCORD_DISPLAY_FIELD_PRESETS[key].templateLine);
    return ["**{craft:name} {link}**", ...lines].join("\n");
}

/** Refresh bounds, kept above Discord's per-channel message-edit rate limit. */
export const MIN_DISPLAY_REFRESH_SECONDS = 15;
export const MAX_DISPLAY_REFRESH_SECONDS = 3600;
export const DEFAULT_DISPLAY_REFRESH_SECONDS = 30;

/** `0` disables the "delete + resend to stay at the bottom of the channel" behavior entirely. */
export const MIN_STICKY_MINUTES = 0;
export const MAX_STICKY_MINUTES = 7 * 24 * 60;

/** Reducer-side ceiling on a display's `limit`; the bot further trims rows per render to fit Discord's message size limits. */
export const MAX_DISPLAY_ROWS_HARD_CAP = 50;
