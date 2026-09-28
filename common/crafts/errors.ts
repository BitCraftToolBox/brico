/**
 * errors.ts — the shared `SenderError` code contract between `backend/brico-module` and the
 * frontend.
 *
 * Plain TypeScript, no imports — this lives in `@brico/crafts` (already a dependency of both
 * `backend/brico-module` and the frontend) rather than a new package, since colocating it costs
 * nothing extra and keeps one fewer `file:` dependency to wire up.
 *
 * Wire format: `new SenderError(CraftError.SOME_CODE)` for the common case (a bare code, nothing
 * else — legible on its own, e.g. `FILTER_TOO_LARGE`). A `` `${CraftError.SOME_CODE}:${value}` ``
 * suffix only for the handful of codes that carry a genuinely dynamic value no shared constant can
 * substitute for (see each code's doc comment below) — `describeServerError` on the frontend splits
 * on the first `:`. Every *fixed* limit (`MAX_FILTER_NAME_LENGTH` etc.) lives here too, specifically
 * so neither side ever needs to put that number on the wire: the frontend imports the same constant
 * the module validates against and interpolates it directly into its translated message.
 */

// ── Shared limits ────────────────────────────────────────────────
//
// Moved here from `backend/brico-module/spacetimedb/src/index.ts` so the frontend's translated
// error messages can interpolate the exact same number the module validates against, without it
// ever needing to travel in the thrown `SenderError` itself.

export const MAX_DISPLAY_NAME_LENGTH = 40;
export const MAX_FILTER_NAME_LENGTH = 80;
export const MAX_FILTER_JSON_LENGTH = 8 * 1024;
export const MAX_SHARED_FILTER_IDS = 200;
/** `attachDiscordWatchDisplay`'s `template` content; only length is validated, not token grammar. */
export const MAX_DISPLAY_TEMPLATE_LENGTH = 2000;
/** `discord_notify_target`'s `added`/`finished`/`removedTemplate` columns (single-line messages). */
export const MAX_NOTIFY_TEMPLATE_LENGTH = 250;

// ── Error codes ──────────────────────────────────────────────────

/**
 * A `const` object (not a bare `type` union) so both `backend/brico-module` and the frontend get
 * autocomplete and refactor-safety at every `throw new SenderError(CraftError.SOME_CODE)` call site,
 * instead of hand-typed string literals repeated ~40 times.
 */
export const CraftError = {
    // Account / identity
    NOT_OIDC_AUTHENTICATED: 'NOT_OIDC_AUTHENTICATED',
    /** Dynamic — carries the rejected issuer as its `:`-suffix (`requireTrustedJwt`, an OIDC-config-level error no normal user flow can trigger). */
    ISSUER_NOT_ACCEPTED: 'ISSUER_NOT_ACCEPTED',
    /** Dynamic — carries the rejected (comma-joined) audience list as its `:`-suffix, same caveat as `ISSUER_NOT_ACCEPTED`. */
    AUDIENCE_NOT_ACCEPTED: 'AUDIENCE_NOT_ACCEPTED',
    NOT_SERVICE_PRINCIPAL: 'NOT_SERVICE_PRINCIPAL',
    /** The caller (`requireAccount`) has no `account` row — as opposed to `UNKNOWN_BRICO_ACCOUNT`, which is about some *other* referenced identity. */
    NO_BRICO_ACCOUNT: 'NO_BRICO_ACCOUNT',
    SERVICE_PRINCIPAL_CANNOT_HOLD_ACCOUNT: 'SERVICE_PRINCIPAL_CANNOT_HOLD_ACCOUNT',
    /** `setDisplayName` — see `MAX_DISPLAY_NAME_LENGTH`. */
    DISPLAY_NAME_TOO_LONG: 'DISPLAY_NAME_TOO_LONG',
    IDENTITY_ALREADY_HAS_ACCOUNT: 'IDENTITY_ALREADY_HAS_ACCOUNT',
    SERVICE_PRINCIPAL_CANNOT_REVOKE_SELF: 'SERVICE_PRINCIPAL_CANNOT_REVOKE_SELF',
    /** A *referenced* identity (not the caller) has no `account` row — see `NO_BRICO_ACCOUNT`. */
    UNKNOWN_BRICO_ACCOUNT: 'UNKNOWN_BRICO_ACCOUNT',

    // Integration links
    EXTERNAL_ACCOUNT_ALREADY_LINKED: 'EXTERNAL_ACCOUNT_ALREADY_LINKED',
    UNKNOWN_INTEGRATION_LINK: 'UNKNOWN_INTEGRATION_LINK',
    LINK_CODE_ALREADY_IN_USE: 'LINK_CODE_ALREADY_IN_USE',
    LINK_CODE_UNKNOWN_OR_EXPIRED: 'LINK_CODE_UNKNOWN_OR_EXPIRED',
    LINK_CODE_ALREADY_CLAIMED: 'LINK_CODE_ALREADY_CLAIMED',
    LINK_CODE_ALREADY_RESOLVED: 'LINK_CODE_ALREADY_RESOLVED',
    LOGIN_NOT_VIA_DISCORD: 'LOGIN_NOT_VIA_DISCORD',
    DISCORD_CLAIMS_MISSING_PROVIDER_ID: 'DISCORD_CLAIMS_MISSING_PROVIDER_ID',

    // Saved filters / watches
    FILTER_INVALID_JSON: 'FILTER_INVALID_JSON',
    /** Dynamic — carries `validateFilter`'s joined (English, deliberately not decomposed — see the design doc) problem list as its `:`-suffix, for `spacetime logs`. The frontend's `ERROR_VOCAB` entry ignores the suffix and shows a generic "that filter isn't valid" message. */
    FILTER_INVALID: 'FILTER_INVALID',
    /** See `MAX_FILTER_NAME_LENGTH`. */
    FILTER_NAME_TOO_LONG: 'FILTER_NAME_TOO_LONG',
    /** See `MAX_FILTER_JSON_LENGTH`. */
    FILTER_TOO_LARGE: 'FILTER_TOO_LARGE',
    FILTER_BELONGS_TO_ANOTHER_ACCOUNT: 'FILTER_BELONGS_TO_ANOTHER_ACCOUNT',
    UNKNOWN_SAVED_FILTER: 'UNKNOWN_SAVED_FILTER',
    WATCH_BELONGS_TO_ANOTHER_ACCOUNT: 'WATCH_BELONGS_TO_ANOTHER_ACCOUNT',
    /** Dynamic — carries the rejected event kind as its `:`-suffix; only `brico-bot` (a service principal) can trigger this, never a real user flow. */
    UNKNOWN_EVENT_KIND: 'UNKNOWN_EVENT_KIND',

    // Bounties & payouts
    RULE_BELONGS_TO_ANOTHER_ACCOUNT: 'RULE_BELONGS_TO_ANOTHER_ACCOUNT',
    RATIO_DENOMINATOR_MUST_BE_POSITIVE: 'RATIO_DENOMINATOR_MUST_BE_POSITIVE',
    /** A negative numerator with a positive denominator still divides to a negative ratio — `parseDecimalRatio` can never produce one (no sign in its grammar), so this is defense-in-depth against a direct reducer call, not a normal UI flow. Covers `craft_bounty_override` and every `bounty_rule` ratio (the flat value and each grid cell). */
    RATIO_NUMERATOR_MUST_NOT_BE_NEGATIVE: 'RATIO_NUMERATOR_MUST_NOT_BE_NEGATIVE',
    OVERRIDE_BELONGS_TO_ANOTHER_ACCOUNT: 'OVERRIDE_BELONGS_TO_ANOTHER_ACCOUNT',
    NO_BOUNTY_ASSIGNMENT: 'NO_BOUNTY_ASSIGNMENT',
    /** Dynamic — carries the rejected currency id as its `:`-suffix. The currency `<Select>` only ever offers `BOUNTY_CURRENCIES`, so this is defense-in-depth, not a normal flow. */
    UNKNOWN_CURRENCY: 'UNKNOWN_CURRENCY',
    /** `upsertLoyaltyReward` — a loyalty reward is a *reward*, never a penalty: `ratioNumerator` must be at least `ratioDenominator` (multiplier >= 1). */
    LOYALTY_MULTIPLIER_TOO_SMALL: 'LOYALTY_MULTIPLIER_TOO_SMALL',
    /** `upsertLoyaltyRule` with a non-null `id` that doesn't resolve to an existing row (already deleted, or never existed). */
    UNKNOWN_LOYALTY_RULE: 'UNKNOWN_LOYALTY_RULE',
    /** Dynamic — carries the rejected flag as its `:`-suffix. `upsertLoyaltyRule`'s `claimMembership.requiredAccess` must be one of `CLAIM_ACCESS_FLAGS`. */
    UNKNOWN_CLAIM_ACCESS_FLAG: 'UNKNOWN_CLAIM_ACCESS_FLAG',
    /** `upsertLoyaltyRule`'s `effortThreshold.threshold` must be non-negative. */
    EFFORT_THRESHOLD_MUST_NOT_BE_NEGATIVE: 'EFFORT_THRESHOLD_MUST_NOT_BE_NEGATIVE',

    // Saved filter sharing
    NO_FILTERS_SELECTED: 'NO_FILTERS_SELECTED',
    /** See `MAX_SHARED_FILTER_IDS`. */
    TOO_MANY_FILTERS_SELECTED: 'TOO_MANY_FILTERS_SELECTED',
    SHARE_CODE_GENERATION_FAILED: 'SHARE_CODE_GENERATION_FAILED',
    UNKNOWN_SHARE_CODE: 'UNKNOWN_SHARE_CODE',

    // Discord watch displays
    /** Dynamic — carries the rejected key as its `:`-suffix. `attachDiscordWatchDisplay`'s `content: {tag: 'presets', ...}` — every entry must be one of `@brico/crafts/discord-display`'s `DISCORD_DISPLAY_FIELD_PRESET_KEYS`. */
    UNKNOWN_FIELD_PRESET: 'UNKNOWN_FIELD_PRESET',
    /** `attachDiscordWatchDisplay`'s `content: {tag: 'template', ...}` — see `MAX_DISPLAY_TEMPLATE_LENGTH`. */
    DISPLAY_TEMPLATE_TOO_LONG: 'DISPLAY_TEMPLATE_TOO_LONG',
    /** `attachDiscordWatchDisplay` — must be one of `DISCORD_DISPLAY_STYLES`. */
    UNKNOWN_DISPLAY_STYLE: 'UNKNOWN_DISPLAY_STYLE',
    /** `attachDiscordWatchDisplay` — must be one of `DISCORD_DISPLAY_SORT_FIELDS`. */
    UNKNOWN_SORT_FIELD: 'UNKNOWN_SORT_FIELD',
    /** `attachDiscordWatchDisplay` — must be `'asc'` or `'desc'`. */
    UNKNOWN_SORT_DIRECTION: 'UNKNOWN_SORT_DIRECTION',
    /** See `MAX_DISPLAY_ROWS_HARD_CAP`. */
    DISPLAY_LIMIT_TOO_LARGE: 'DISPLAY_LIMIT_TOO_LARGE',
    /** See `MIN_DISPLAY_REFRESH_SECONDS`/`MAX_DISPLAY_REFRESH_SECONDS`. */
    DISPLAY_REFRESH_OUT_OF_RANGE: 'DISPLAY_REFRESH_OUT_OF_RANGE',
    /** See `MIN_STICKY_MINUTES`/`MAX_STICKY_MINUTES`. */
    STICKY_MINUTES_OUT_OF_RANGE: 'STICKY_MINUTES_OUT_OF_RANGE',
    /** `attachDiscordWatchDisplay`'s `filterId` doesn't resolve to a live `saved_craft_filter` owned by `accountIdentity`. */
    UNKNOWN_SAVED_FILTER_FOR_DISPLAY: 'UNKNOWN_SAVED_FILTER_FOR_DISPLAY',
    /** `detachDiscordWatchDisplay`/`setDiscordWatchDisplayMessage` — no such row. */
    UNKNOWN_DISCORD_WATCH_DISPLAY: 'UNKNOWN_DISCORD_WATCH_DISPLAY',

    // Discord notification sink
    /** `detachDiscordNotifySink` — no such row. Also thrown by `upsertDiscordNotifyTargetTemplate`/`attachDiscordNotifyTarget` when the referenced sink doesn't exist, is tombstoned, or belongs to another account. */
    UNKNOWN_DISCORD_NOTIFY_SINK: 'UNKNOWN_DISCORD_NOTIFY_SINK',
    /** `upsertCraftFilterNotifyTrigger`'s `filterId` doesn't resolve to a live `saved_craft_filter` owned by the caller. */
    UNKNOWN_SAVED_FILTER_FOR_NOTIFY: 'UNKNOWN_SAVED_FILTER_FOR_NOTIFY',
    /** `detachCraftFilterNotifyTrigger` — the row (found by its own global id) belongs to a different account. A missing row is a silent no-op. */
    CRAFT_FILTER_NOTIFY_TRIGGER_BELONGS_TO_ANOTHER_ACCOUNT: 'CRAFT_FILTER_NOTIFY_TRIGGER_BELONGS_TO_ANOTHER_ACCOUNT',
    /** `detachDiscordNotifyTarget` — the row belongs to a different account. */
    DISCORD_NOTIFY_TARGET_BELONGS_TO_ANOTHER_ACCOUNT: 'DISCORD_NOTIFY_TARGET_BELONGS_TO_ANOTHER_ACCOUNT',
    /** See `MAX_NOTIFY_TEMPLATE_LENGTH`. */
    NOTIFY_TEMPLATE_TOO_LONG: 'NOTIFY_TEMPLATE_TOO_LONG',

    // Discord guild install
    /** Dynamic — carries the rejected value as its `:`-suffix. `upsertDiscordGuildInstall`'s `commandMode` must be one of `@brico/crafts/discord-guild`'s `DISCORD_COMMAND_MODES`. */
    UNKNOWN_COMMAND_MODE: 'UNKNOWN_COMMAND_MODE',
} as const;

export type CraftErrorCode = (typeof CraftError)[keyof typeof CraftError];
