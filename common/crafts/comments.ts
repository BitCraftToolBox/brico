/** Comment limits, page keys, body and display-name validation shared by `brico-module` and the frontend. */

import {MAX_DISPLAY_NAME_LENGTH} from "./errors.ts";

// NB: setting this to higher than one means that a deleted intermediate reply orphans its children
// find some alternate method of keeping structure before raising this
/** Deepest reply level: 0 is top level, so 1 allows one level of replies and no replies to replies. */
export const MAX_COMMENT_DEPTH = 1;

export const MAX_COMMENT_LENGTH = 4000;
/** Top-level comments per page; bounds the size of one page's subscription. */
export const MAX_TOP_LEVEL_COMMENTS_PER_PAGE = 500;

/** Minimum gap between one account's posts, and its cap per rolling hour. */
export const COMMENT_COOLDOWN_SECONDS = 15;
export const MAX_COMMENTS_PER_HOUR = 30;

export const MIN_DISPLAY_NAME_LENGTH = 2;

/** Reports one account may file per rolling hour. */
export const MAX_REPORTS_PER_HOUR = 10;
export const MAX_REPORT_NOTE_LENGTH = 500;
export const MAX_MODERATION_REASON_LENGTH = 500;

/** Distinct accounts with an open spam/abuse/off-topic/other report that move a visible comment to `pending`. */
export const HIDE_REPORT_THRESHOLD = 3;
/** Distinct accounts with an open `outdated` report that flag a comment outdated. */
export const OUTDATED_REPORT_THRESHOLD = 3;

/** The `*Until` value for a restriction with no end: 9999-12-31T23:59:59Z in microseconds since the Unix epoch. */
export const PERMANENT_UNTIL_MICROS = 253_402_300_799_000_000n;

/** `comment.status` values. A `u8` because query-builder `.eq()` doesn't accept enum literals. */
export const CommentStatus = {
    Visible: 0,
    Pending: 1,
    Hidden: 2,
    Deleted: 3,
} as const;

/** `comment_report.state` values; a `u8` for the same reason as `CommentStatus`. */
export const ReportState = {
    Open: 0,
    Dismissed: 1,
    Actioned: 2,
} as const;

// ── Version stamps ───────────────────────────────────────────────

/** The release number at the start of a `latest.json` `releaseLabel`, e.g. `1.46` from `"1.46 - Autumn Takes Root"`. */
const RELEASE_VERSION_PATTERN = /^(\d\.\d{1,3})/;

export function parseReleaseVersion(releaseLabel: string | null | undefined): string | undefined {
    return releaseLabel?.match(RELEASE_VERSION_PATTERN)?.[1];
}

/** What `comment.versionTag` holds: `"1.46 (2026-10-27)"`, or the bare data tag when the release version is unknown. */
export function formatVersionStamp(releaseVersion: string | undefined, dataTag: string): string {
    return releaseVersion === undefined ? dataTag : `${releaseVersion} (${dataTag})`;
}

/** Splits a stamp into the release version to display and the data tag for its tooltip. A bare tag is shown as the version. */
export function parseVersionStamp(stamp: string): { version: string; tag: string | undefined } {
    const match = stamp.match(/^(\S+) \((.+)\)$/);
    return match ? {version: match[1], tag: match[2]} : {version: stamp, tag: undefined};
}

// ── Page keys ────────────────────────────────────────────────────

const PAGE_KEY_PATTERN = /^[a-z][a-z-]{0,31}:[0-9]{1,20}$/;

/** `"<route segment>:<id>"`, e.g. `item:1234`. One key per entity, shared by every locale and URL variant of its page. */
export function commentPageKey(kind: string, id: number | bigint | string): string {
    return `${kind}:${id}`;
}

export function isValidCommentPageKey(pageKey: string): boolean {
    return PAGE_KEY_PATTERN.test(pageKey);
}

// ── Body ─────────────────────────────────────────────────────────

/**
 * The body with line endings normalized and surrounding whitespace trimmed, or `null` if it is
 * empty, longer than `MAX_COMMENT_LENGTH` code points, or has control characters other than
 * newline and tab.
 */
export function normalizeCommentBody(input: string): string | null {
    const body = input.replace(/\r\n?/g, "\n").trim();
    if (body === "" || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body)) return null;
    return [...body].length <= MAX_COMMENT_LENGTH ? body : null;
}

/**
 * A report note or moderation reason with line endings normalized and whitespace trimmed, or
 * `null` if it is longer than `maxLength` code points or has control characters other than
 * newline and tab. Empty input returns `""`.
 */
export function normalizeNote(input: string, maxLength: number): string | null {
    const note = input.replace(/\r\n?/g, "\n").trim();
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(note)) return null;
    return [...note].length <= maxLength ? note : null;
}

// ── Display names ────────────────────────────────────────────────

/**
 * A name unit: a letter or number plus up to two combining marks, enough for accents and Indic,
 * Thai or Japanese text but too few for stacked-mark "zalgo".
 */
const NAME_UNIT = "[\\p{L}\\p{N}]\\p{M}{0,2}";
const DISPLAY_NAME_PATTERN = new RegExp(`^${NAME_UNIT}(?:[ _.-]?${NAME_UNIT})*$`, "u");

export type DisplayNameProblem = "too-short" | "too-long" | "characters";

/**
 * Checks a display name after NFC normalization and trimming. Letters, numbers and single
 * internal spaces, `_`, `-` and `.` only: a superset of BitCraft handles (`^[\p{L}\p{N}]+$`) and
 * Discord ones, so a handle copied from a link always passes. No emoji, symbols, or
 * format/control characters.
 */
export function checkDisplayName(input: string): { name: string } | { problem: DisplayNameProblem } {
    const name = input.normalize("NFC").trim();
    const length = [...name].length;
    if (length < MIN_DISPLAY_NAME_LENGTH) return {problem: "too-short"};
    if (length > MAX_DISPLAY_NAME_LENGTH) return {problem: "too-long"};
    if (!DISPLAY_NAME_PATTERN.test(name)) return {problem: "characters"};
    return {name};
}
