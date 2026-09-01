/**
 * error-vocab.ts — translates a caught `SenderError` (or any other rejection) from
 * `backend/brico-module` into localized display text.
 *
 * The module throws a bare `CraftError` code (`@brico/crafts/errors`) for the common case, or a
 * `` `${code}:${value}` ``
 * pair for the handful of codes that carry a genuinely dynamic value (see `errors.ts`'s doc
 * comments for which). `ERROR_VOCAB` is an exhaustive (non-`Partial`) `Record<CraftErrorCode, ...>`
 * — TypeScript refuses to compile if `@brico/crafts/errors` grows a code this file hasn't caught up
 * to, the same compile-time guarantee `filter-vocab.ts` uses for field/comparator labels.
 */
import {CraftError, type CraftErrorCode, MAX_DISPLAY_NAME_LENGTH, MAX_FILTER_JSON_LENGTH, MAX_FILTER_NAME_LENGTH, MAX_SHARED_FILTER_IDS,} from "@brico/crafts/errors";
import {i18n, type MessageDescriptor} from "@lingui/core";
import {msg} from "@lingui/core/macro";

type VocabEntry = MessageDescriptor | ((value: string) => MessageDescriptor);

/**
 * Every entry needs *a* translatable message, even the ones only a service-principal/internal path
 * can trigger — `CraftError`'s value is being exhaustive, so those just get plain, unfancy text
 * rather than bespoke wording (a real user should never see them, but "never" isn't "can't").
 */
const ERROR_VOCAB: Record<CraftErrorCode, VocabEntry> = {
    [CraftError.NOT_OIDC_AUTHENTICATED]: msg`You need to be logged in to do that.`,
    [CraftError.ISSUER_NOT_ACCEPTED]: (issuer) => msg`Login issuer not accepted: ${issuer}`,
    [CraftError.AUDIENCE_NOT_ACCEPTED]: () => msg`This login can't be used here.`,
    [CraftError.NOT_SERVICE_PRINCIPAL]: msg`This action is restricted.`,
    [CraftError.NO_BRICO_ACCOUNT]: msg`Log in and try again.`,
    [CraftError.SERVICE_PRINCIPAL_CANNOT_HOLD_ACCOUNT]: msg`This identity can't hold a brico account.`,
    [CraftError.DISPLAY_NAME_TOO_LONG]: msg`That name is too long (maximum ${MAX_DISPLAY_NAME_LENGTH} characters).`,
    [CraftError.IDENTITY_ALREADY_HAS_ACCOUNT]: msg`That identity already has a brico account.`,
    [CraftError.SERVICE_PRINCIPAL_CANNOT_REVOKE_SELF]: msg`You can't revoke your own access.`,
    [CraftError.UNKNOWN_BRICO_ACCOUNT]: msg`That account doesn't exist.`,
    [CraftError.EXTERNAL_ACCOUNT_ALREADY_LINKED]: msg`That account is already linked to a different brico account.`,
    [CraftError.UNKNOWN_INTEGRATION_LINK]: msg`That link no longer exists.`,
    [CraftError.LINK_CODE_ALREADY_IN_USE]: msg`That link code is already in use — try again.`,
    [CraftError.LINK_CODE_UNKNOWN_OR_EXPIRED]: msg`That link code is unknown or has expired.`,
    [CraftError.LINK_CODE_ALREADY_CLAIMED]: msg`That link code has already been claimed.`,
    [CraftError.LINK_CODE_ALREADY_RESOLVED]: msg`That link code has already been used.`,
    [CraftError.LOGIN_NOT_VIA_DISCORD]: msg`You're not logged in with Discord.`,
    [CraftError.DISCORD_CLAIMS_MISSING_PROVIDER_ID]: msg`Your Discord login is missing required information — try logging in again.`,
    [CraftError.FILTER_INVALID_JSON]: msg`That filter isn't valid JSON.`,
    // `value` (the joined `validateFilter` problem list) is deliberately dropped — see the design
    // doc's note on not decomposing/translating validateFilter's own composed problem strings.
    [CraftError.FILTER_INVALID]: () => msg`That filter isn't valid.`,
    [CraftError.FILTER_NAME_TOO_LONG]: msg`That name is too long (maximum ${MAX_FILTER_NAME_LENGTH} characters).`,
    [CraftError.FILTER_TOO_LARGE]: msg`That filter is too large (maximum ${MAX_FILTER_JSON_LENGTH} bytes).`,
    [CraftError.FILTER_BELONGS_TO_ANOTHER_ACCOUNT]: msg`That filter belongs to a different account.`,
    [CraftError.UNKNOWN_SAVED_FILTER]: msg`That saved filter no longer exists.`,
    [CraftError.WATCH_BELONGS_TO_ANOTHER_ACCOUNT]: msg`That watch belongs to a different account.`,
    [CraftError.UNKNOWN_EVENT_KIND]: (kind) => msg`Unknown event: ${kind}`,
    [CraftError.RULE_BELONGS_TO_ANOTHER_ACCOUNT]: msg`That bounty rule belongs to a different account.`,
    [CraftError.RATIO_DENOMINATOR_MUST_BE_POSITIVE]: msg`Enter a valid rate.`,
    [CraftError.RATIO_NUMERATOR_MUST_NOT_BE_NEGATIVE]: msg`Enter a valid rate.`,
    [CraftError.OVERRIDE_BELONGS_TO_ANOTHER_ACCOUNT]: msg`That bounty belongs to a different account.`,
    [CraftError.NO_BOUNTY_ASSIGNMENT]: msg`This craft has no bounty assigned yet.`,
    [CraftError.UNKNOWN_CURRENCY]: (currency) => msg`"${currency}" isn't a supported currency.`,
    [CraftError.LOYALTY_MULTIPLIER_TOO_SMALL]: msg`A loyalty reward's multiplier must be 1 or higher.`,
    [CraftError.NO_FILTERS_SELECTED]: msg`Select at least one filter.`,
    [CraftError.TOO_MANY_FILTERS_SELECTED]: msg`Too many filters selected (maximum ${MAX_SHARED_FILTER_IDS}).`,
    [CraftError.SHARE_CODE_GENERATION_FAILED]: msg`Could not generate a share code — try again.`,
    [CraftError.UNKNOWN_SHARE_CODE]: msg`That share code doesn't exist.`,
};

/**
 * Best-effort translation of a caught reducer/procedure rejection; falls back to the raw message
 * untranslated. Plain `i18n._()`, not `<Trans>` JSX — safe to call from inside a `.catch()` running
 * after an `await` (no Solid render-owner needed).
 *
 * Never worse than doing nothing: an error with no vocabulary entry (or one the SDK throws itself,
 * e.g. a network failure) doesn't match any code below and falls through to the raw text.
 */
export function describeServerError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const [code, value] = raw.split(/:(.*)/s, 2) as [string, string | undefined];
    const entry = (ERROR_VOCAB as Partial<Record<string, VocabEntry>>)[code];
    if (!entry) return raw;
    return i18n._(typeof entry === "function" ? entry(value ?? "") : entry);
}
