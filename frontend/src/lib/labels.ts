/**
 * Labels — one type for "a piece of display text", resolvable from either translation system.
 *
 * The app has two of them (see `~/lib/i18n` and `~/lib/data-translation`) and a few labels
 * genuinely belong to the *game's*: most sidebar titles are the names of BitCraft's own compendium
 * sections, and rarity/stat names are game vocabulary the player already knows from the client.
 * Translating those ourselves would invent a second wording for text the game has already
 * localized — so they go through the game catalogs by default. But a UI translator (Crowdin) can
 * still override the game's wording for a specific label, and that override wins: priority is
 * UI-translator-override, then the game catalog, then the English source.
 *
 * Both kinds resolve reactively, so a locale change on either side updates the label with no
 * call-site involvement. Resolve inside a component with `useLabel()`; outside one — a `msg`
 * descriptor built at module scope, say — store the `Label` and resolve at render time, never at
 * construction, or it freezes at the wrong moment.
 */

import {i18n, type MessageDescriptor} from "@lingui/core";
import {useLingui} from "@lingui/solid";
import {translateGameText} from "~/lib/data-translation";

/**
 * A label whose text the game itself already translates. `source` is the exact English string to
 * match against the game catalogs' `source` column; `fallback` is the Lingui message used when
 * that lookup misses, which covers both the `en` case and app-only wording the game has no entry
 * for ("Item Lists", "Quest Chains", "Toolbox", …).
 */
export type GameLabel = {
    readonly kind: "game";
    readonly source: string;
    readonly fallback: MessageDescriptor;
};

/**
 * Either kind of translatable label. A `MessageDescriptor` (from the `msg` macro) is the default;
 * wrap it in `gameText()` to prefer the game's translation.
 *
 * `string` is accepted at most call sites too, for text not yet migrated to either system.
 */
export type Label = MessageDescriptor | GameLabel;

export function isGameLabel(label: Label | string): label is GameLabel {
    return typeof label !== "string" && (label as GameLabel).kind === "game";
}

/**
 * Marks a label as game vocabulary: normally rendered from the game-data catalogs, but a UI
 * translator can still override the wording for this specific label — that override takes
 * priority over the game's translation, which in turn takes priority over the English source.
 *
 * ```ts
 * titleLabel: gameText(msg`Items`)                       // source defaults to the msgid
 * titleLabel: gameText(msg`Experience`, "EXP")       // …unless the game words it differently
 * ```
 *
 * The source string defaults to the descriptor's message (i.e. the English text the `msg` macro
 * was written with), so the two never drift apart. Pass `source` explicitly only when the app's
 * wording differs from the game's.
 *
 * Interpolated descriptors work, because the game's own strings carry the same `{0}` placeholders
 * and Lingui's `msg` macro leaves them in the msgid:
 *
 * ```ts
 * label(gameText(msg`Tier ${props.tier}`))              // msgid "Tier {0}" → "Palier 3"
 * ```
 *
 * Matching is still exact string equality on the *un*filled template, so the descriptor's msgid
 * has to read exactly as the game's does — see `interpolate` for how the values are put back.
 */
export function gameText(fallback: MessageDescriptor, source?: string): GameLabel {
    return {
        kind: "game",
        source: source ?? fallback.message ?? String(fallback.id),
        fallback,
    };
}

/**
 * The canonical English text of a `Label`, untranslated — for identity uses (persisted keys,
 * `name`/`id`-style props) where a `Label` is accepted for display but the value must stay stable
 * across locales. Not reactive; there is nothing to react to.
 */
export function labelSource(label: Label | string): string {
    if (typeof label === "string") return label;
    if (isGameLabel(label)) return interpolate(label.source, label.fallback.values);
    return interpolate(label.message ?? String(label.id), label.values);
}

/** Resolves a `Label` to display text. See `useLabel` — this is its non-hook form. */
export type LabelResolver = (label: Label | string) => string;

/**
 * Fills the `{0}` / `{name}` placeholders of a template with a descriptor's `values`.
 *
 * Only needed on the game-catalog path: Lingui interpolates its own messages, but a string coming
 * out of the game CSV has never seen the descriptor. The game's templates use ICU-style positional
 * placeholders (`Tier {0}`, `Requires a Tier {0} {1} equipped to {2}`) and translators reorder them
 * freely (fr: `Nécessite un(e) {1} de niveau {0} équipé(e) sur {2}`), so match by name first.
 *
 * The positional fallback covers the naming mismatch Lingui can introduce: it names a placeholder
 * after the interpolated expression when that's a plain identifier (`` msg`Tier ${tier}` `` →
 * `Tier {tier}`) and numbers it otherwise (`` msg`Tier ${props.tier}` `` → `Tier {0}`). Values are
 * emitted in source order, so falling back to argument order lines the two up. Anything still
 * unmatched is left as-is rather than printed as "undefined".
 */
function interpolate(template: string, values: Record<string, unknown> | undefined): string {
    if (!values) return template;
    const ordered = Object.values(values);
    let next = 0;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
        const value = name in values ? values[name] : ordered[next++];
        return value === undefined ? placeholder : String(value);
    });
}

function resolveLabel(_: (d: MessageDescriptor) => string, label: Label | string): string {
    if (typeof label === "string") return label;
    if (isGameLabel(label)) {
        const values = label.fallback.values;
        const uiText = _(label.fallback);
        // A UI translator has overridden this string — that wins over the game's own wording, so
        // Crowdin can correct or replace game vocabulary. An untouched catalog resolves to the
        // descriptor's own English text unchanged, which is how we tell "overridden" apart from
        // "not yet translated" without a separate flag. Compare against the *descriptor's* English
        // (interpolated, as Lingui just did), not `source`: those differ whenever the app's wording
        // differs from the game's, and every interpolated label differs from its own template.
        const english = interpolate(label.fallback.message ?? label.source, values);
        if (uiText !== english) return uiText;
        const translated = translateGameText(label.source);
        // A miss returns the source unchanged; fall back to the (English) UI text in that case.
        return translated === label.source ? uiText : interpolate(translated, values);
    }
    return _(label);
}

/**
 * Returns a resolver for `Label` values.
 *
 * Reactive on *both* locales: `_` comes from Lingui's Solid context, and `translateGameText` reads
 * `activeDataLocale`. Call the returned function inside JSX or a computation — calling it once and
 * caching the string defeats the whole point.
 */
export function useLabel(): LabelResolver {
    const {_} = useLingui();
    return (label) => resolveLabel(_, label);
}

/**
 * Non-hook form of `useLabel`, for module-scope helpers that build JSX outside a component body
 * (e.g. `breadcrumb()`). Uses the module-global Lingui instance directly, so — same as the bare `t`
 * macro (see i18n.ts) — the caller must call `trackUILocale()` first for reactivity.
 */
export function labelText(label: Label | string): string {
    return resolveLabel((d) => i18n._(d), label);
}
