/**
 * errors.ts — the shared `SenderError` code contract between `backend/brico-module` and the
 * frontend, per `docs/craft-manager-i18n-design.md` part 2's decided design (option A: structured
 * error codes, not the frontend-only regex table the doc originally recommended — codes turned out
 * to be legible enough in `spacetime logs`/`spacetime call` output on their own that there was no
 * "keep the log text human-sentence-readable" cost left to justify the regex approach's ongoing
 * drift risk).
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

// ── Error codes ──────────────────────────────────────────────────

/**
 * A `const` object (not a bare `type` union) so both `backend/brico-module` and the frontend get
 * autocomplete and refactor-safety at every `throw new SenderError(CraftError.SOME_CODE)` call site,
 * instead of hand-typed string literals repeated ~40 times.
 *
 * Every reducer/procedure that can reject a caller-triggered request needs *a* code here — including
 * the internal/service-principal-only ones nobody but `brico-bot` can trigger — because the value of
 * this contract is being exhaustive: `frontend/src/lib/crafts/error-vocab.ts`'s `ERROR_VOCAB` is a
 * plain (non-`Partial`) `Record<CraftErrorCode, ...>`, so TypeScript refuses to compile if this
 * object grows an entry that file hasn't caught up to. Low-priority codes just get plain, unfancy
 * `msg` text there rather than bespoke wording.
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

    // Saved filter sharing
    NO_FILTERS_SELECTED: 'NO_FILTERS_SELECTED',
    /** See `MAX_SHARED_FILTER_IDS`. */
    TOO_MANY_FILTERS_SELECTED: 'TOO_MANY_FILTERS_SELECTED',
    SHARE_CODE_GENERATION_FAILED: 'SHARE_CODE_GENERATION_FAILED',
    UNKNOWN_SHARE_CODE: 'UNKNOWN_SHARE_CODE',
} as const;

export type CraftErrorCode = (typeof CraftError)[keyof typeof CraftError];
