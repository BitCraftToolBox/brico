/**
 * Substitutes `{token}`/`{token:format}` placeholders in a Discord display or notification template
 * against one craft's facts. Unrecognized tokens are left as literal text rather than throwing.
 */
import {CURRENCY_EMOJI, CURRENCY_LABELS} from "./filter.ts";

/** Everything one craft's rendered template line might reference. */
export interface DiscordTemplateContext {
    recipeName: string;
    craftId: string;
    frontendOrigin: string;
    ownerName: string | null;
    claimName: string | null;
    regionId: number;
    tier: number | null;
    skillName: string | null;
    effortTotal: number;
    effortRemaining: number;
    payout: number | null;
    currency: string | null;
    /** The watch's saved-filter name. */
    filterName: string;
    /** `<@userId>`/`<@&roleId>`, or `null` if none is configured; notifications only. */
    mentionText: string | null;
}

const DASH = "—";

/** `10900000` → `"10.9M"`, `124000` → `"124K"`. */
export function formatCompact(n: number): string {
    return new Intl.NumberFormat("en", {notation: "compact", maximumFractionDigits: 1}).format(n);
}

type TokenResolver = (ctx: DiscordTemplateContext) => string;

const TOKENS: Record<string, TokenResolver> = {
    "craft:link": ctx => `[${ctx.recipeName}](<${ctx.frontendOrigin}/tools/crafts/${ctx.craftId}>)`,
    "craft:name": ctx => `${ctx.recipeName}`,
    "link": ctx => `[↗](<${ctx.frontendOrigin}/tools/crafts/${ctx.craftId}>)`,
    username: ctx => ctx.ownerName ?? DASH,
    claim: ctx => ctx.claimName ?? DASH,
    "region:short": ctx => `(R${ctx.regionId})`,
    "tier:short": ctx => (ctx.tier !== null ? `T${ctx.tier}` : DASH),
    skill: ctx => ctx.skillName ?? DASH,
    "remaining:short": ctx => formatCompact(ctx.effortRemaining),
    "progress:percent": ctx => {
        const percent = ctx.effortTotal > 0 ? (100 * (ctx.effortTotal - ctx.effortRemaining)) / ctx.effortTotal : 0;
        return `${Math.round(percent)}%`;
    },
    "bounty:effort": ctx => {
        if (ctx.payout === null || ctx.currency === null || ctx.payout <= 0) return DASH;
        const effortPerCurrency = 1 / ctx.payout;
        const currencyLabel = CURRENCY_EMOJI[ctx.currency] ?? CURRENCY_LABELS[ctx.currency] ?? ctx.currency;
        return `${effortPerCurrency.toLocaleString("en", {maximumFractionDigits: 1})} effort/${currencyLabel}`;
    },
    "payout:remaining": ctx => (ctx.payout !== null ? formatCompact(ctx.payout * ctx.effortRemaining) : DASH),
    filterName: ctx => ctx.filterName,
    mention: ctx => ctx.mentionText ?? "",
};

const TOKEN_PATTERN = /\{([^{}]+)}/g;

/** Substitutes every recognized `{token}`/`{token:format}` in `template` against `ctx`; an unrecognized token is left as-is. */
export function renderDiscordTemplate(template: string, ctx: DiscordTemplateContext): string {
    return template.replace(TOKEN_PATTERN, (placeholder, token: string) => {
        const resolve = TOKENS[token];
        return resolve ? resolve(ctx) : placeholder;
    });
}
