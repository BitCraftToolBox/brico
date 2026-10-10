/**
 * Stelo wallet vocabulary shared by the module, the bot and the frontend: account addresses, the
 * funding-status allow-lists and the funding-alert kinds and default wording.
 */

/**
 * Normalizes a pasted Stelo address: trims, drops one leading `#` and ASCII-upper-cases, as Stelo's
 * account search does. Addresses may be custom, so any non-empty remainder is accepted; `null` if empty.
 */
export function normalizeSteloAddress(input: string): string | null {
    let address = input.trim();
    if (address.startsWith("#")) address = address.slice(1);
    address = address.replace(/[a-z]+/g, (s) => s.toUpperCase());
    return address === "" ? null : address;
}

/** `craft_bounty_funding.state`. */
export const FUNDING_STATES = ["waiting", "funding", "failed", "funded"] as const;
export type FundingState = (typeof FUNDING_STATES)[number];

/** `craft_bounty_funding.source`. */
export const FUNDING_SOURCES = ["override", "rule"] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];

/** Machine codes for `craft_bounty_funding.reason` and funding notifications. */
export const FUNDING_REASONS = [
    "no-wallet",
    "wallet-inactive",
    "cannot-pull",
    "not-authorized",
    "stelo-unavailable",
    "insufficient-funds",
    "no-permission",
    "invalid-account",
] as const;
export type FundingReason = (typeof FUNDING_REASONS)[number];

/** Reasons a payer can act on; entering `waiting` with one of these raises a funding alert. */
export const ACTIONABLE_FUNDING_REASONS: readonly string[] = [
    "cannot-pull", "not-authorized", "wallet-inactive", "insufficient-funds", "no-permission", "invalid-account",
];

/** The payer's bounty overview page, which funding alerts point at. */
export const MY_BOUNTIES_PATH = "/account/my-bounties";

/** `FundingNotificationPayload.kind`. */
export const FUNDING_NOTIFICATION_KINDS = ["funding-failed", "payout-shortfall", "unclaimed-rolled-over", "unclaimed-returned"] as const;
export type FundingNotificationKind = (typeof FUNDING_NOTIFICATION_KINDS)[number];

/** `FundingNotificationPayload.role`. */
export const FUNDING_NOTIFICATION_ROLES = ["payer", "payee"] as const;

/** The three on/off events of a `funding_notify_trigger`. */
export const FUNDING_NOTIFY_EVENTS = ["fundingFailed", "payoutShortfall", "unclaimed"] as const;
export type FundingNotifyEvent = (typeof FUNDING_NOTIFY_EVENTS)[number];

/** The event whose flag enables a notification of `kind`. */
export function fundingEventOf(kind: FundingNotificationKind): FundingNotifyEvent {
    switch (kind) {
        case "funding-failed":
            return "fundingFailed";
        case "payout-shortfall":
            return "payoutShortfall";
        default:
            return "unclaimed";
    }
}

/**
 * Default Discord wording per event. Tokens: `{currency}`, `{amount}`, `{craft}` (link, empty without
 * a craft), `{bounties}` (link to the payer's bounties page), `{wallet}`, `{reason}` and `{mention}`.
 */
export const DEFAULT_FUNDING_NOTIFY_TEMPLATE: Record<FundingNotifyEvent, string> = {
    fundingFailed: "{mention} Couldn't fund your bounties in {currency} from {wallet}: {reason}. {bounties}",
    payoutShortfall: "{mention} Couldn't pull {amount} {currency} of payouts from {wallet}: {reason}.",
    unclaimed: "{mention} {amount} {currency} went unclaimed and was moved: {reason}.",
};

/**
 * English wording for each `FundingReason`, as a clause that continues a sentence. The frontend's
 * translated copy (`funding-vocab.ts`) is this text capitalized with a trailing period.
 */
export const FUNDING_REASON_TEXT: Record<FundingReason, string> = {
    "no-wallet": "no funding wallet is chosen",
    "wallet-inactive": "the funding wallet is no longer linked",
    "cannot-pull": "Brico.app needs Write access on the funding wallet",
    "not-authorized": "the account that linked the funding wallet is no longer an Admin or Owner of it",
    "stelo-unavailable": "Stelo is unavailable right now",
    "insufficient-funds": "the funding wallet doesn't have enough funds",
    "no-permission": "Brico.app lost permission on the funding wallet",
    "invalid-account": "the funding wallet account is invalid",
};

/** What happened to unclaimed money, in the `{reason}` slot of an `unclaimed` message. */
export const UNCLAIMED_OUTCOME_TEXT = {
    "rolled-over": "rolled over",
    "returned": "returned to the payer",
} as const;

/** The wording for a reason code or unclaimed outcome; an unknown code is returned as is. */
export function describeFundingReason(code: string): string {
    return (FUNDING_REASON_TEXT as Record<string, string | undefined>)[code]
        ?? (UNCLAIMED_OUTCOME_TEXT as Record<string, string | undefined>)[code]
        ?? code;
}

export interface FundingTemplateContext {
    currency: string;
    amount: string | null;
    /** A craft link, or `null` when the event has none. */
    craft: string | null;
    /** A link to the payer's bounties page. */
    bounties: string | null;
    wallet: string | null;
    reason: string | null;
    mentionText: string | null;
}

/** Substitutes the funding tokens; an unknown token is left as literal text. */
export function renderFundingTemplate(template: string, ctx: FundingTemplateContext): string {
    return template.replace(/\{([^{}]+)}/g, (placeholder, token: string) => {
        switch (token) {
            case "currency":
                return ctx.currency;
            case "amount":
                return ctx.amount ?? "";
            case "craft":
                return ctx.craft ?? "";
            case "bounties":
                return ctx.bounties ?? "";
            case "wallet":
                return ctx.wallet ?? "";
            case "reason":
                return ctx.reason ? describeFundingReason(ctx.reason) : "";
            case "mention":
                return ctx.mentionText ?? "";
            default:
                return placeholder;
        }
    });
}
