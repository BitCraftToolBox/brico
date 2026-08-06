/**
 * Parses a PO file into an order-independent list of its non-obsolete entries, for comparing two
 * catalogs by content rather than by raw bytes. Byte diffs pick up incidental noise neither script
 * cares about: PO-Revision-Date/X-Generator headers Crowdin rewrites on every export, line-wrapping
 * differences between Crowdin's writer and `@lingui/format-po`, a missing/extra EOF newline, or
 * entries simply being in a different order.
 *
 * `includeMsgstr` controls whether translated text counts as a difference:
 *  - `diff-check.mjs` (is this Crowdin download worth a PR?) wants `true` — a translation edit is
 *    exactly the change it's looking for.
 *  - `extract.mjs --check` (did source change without re-running extraction?) wants `false` —
 *    extraction never touches an existing `msgstr`, so a translator's or Crowdin's edit to one
 *    (including pseudolocale re-generation) is not "the catalog is out of date with source".
 */
import {parsePo} from "pofile-ts";

export function itemsOf(content, {includeMsgstr}) {
    const po = parsePo(content);
    return po.items
        .filter((item) => !item.obsolete)
        .map((item) => ({
            msgid: item.msgid,
            msgctxt: item.msgctxt,
            comments: item.extractedComments,
            ...(includeMsgstr ? {msgstr: item.msgstr} : {}),
        }))
        .sort((a, b) => (a.msgid + (a.msgctxt ?? "")).localeCompare(b.msgid + (b.msgctxt ?? "")));
}
