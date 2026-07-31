/**
 * Labels — one type for "a piece of display text", resolvable from either translation system.
 *
 * The app has two of them (see `~/lib/i18n` and `~/lib/data-translation`) and a few labels
 * genuinely belong to the *game's*: most sidebar titles are the names of BitCraft's own compendium
 * sections, and rarity/stat names are game vocabulary the player already knows from the client.
 * Translating those ourselves would invent a second wording for text the game has already
 * localized — so they go through the game catalogs, with the Lingui message as the fallback for
 * anything the game doesn't publish.
 *
 * Both kinds resolve reactively, so a locale change on either side updates the label with no
 * call-site involvement. Resolve inside a component with `useLabel()`; outside one — a `msg`
 * descriptor built at module scope, say — store the `Label` and resolve at render time, never at
 * construction, or it freezes at the wrong moment.
 */

import type {MessageDescriptor} from "@lingui/core";
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
 * Marks a label as game vocabulary: look it up in the game-data catalogs first, fall back to the
 * Lingui catalog.
 *
 * ```ts
 * titleLabel: gameText(msg`Items`)                       // source defaults to the msgid
 * titleLabel: gameText(msg`Structures`, "Building")       // …unless the game words it differently
 * ```
 *
 * The source string defaults to the descriptor's message (i.e. the English text the `msg` macro
 * was written with), so the two never drift apart. Pass `source` explicitly only when the app's
 * wording differs from the game's. Keep the descriptor a plain literal with no placeholders —
 * game-catalog matching is exact string equality, so an interpolated message can never hit.
 */
export function gameText(fallback: MessageDescriptor, source?: string): GameLabel {
    return {
        kind: "game",
        source: source ?? fallback.message ?? String(fallback.id),
        fallback,
    };
}

/** Resolves a `Label` to display text. See `useLabel` — this is its non-hook form. */
export type LabelResolver = (label: Label | string) => string;

/**
 * Returns a resolver for `Label` values.
 *
 * Reactive on *both* locales: `_` comes from Lingui's Solid context, and `translateGameText` reads
 * `activeDataLocale`. Call the returned function inside JSX or a computation — calling it once and
 * caching the string defeats the whole point.
 */
export function useLabel(): LabelResolver {
    const {_} = useLingui();
    return (label) => {
        if (typeof label === "string") return label;
        if (isGameLabel(label)) {
            const translated = translateGameText(label.source);
            // A miss returns the source unchanged; prefer the app's own catalog in that case, so a
            // label the game doesn't publish still follows the UI language.
            return translated === label.source ? _(label.fallback) : translated;
        }
        return _(label);
    };
}
