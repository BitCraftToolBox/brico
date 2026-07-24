import {AlgebraicType} from "@clockworklabs/spacetimedb-sdk";
import {csvParse} from "d3-dsv";
import {Accessor, createEffect, createRoot, createSignal} from "solid-js";
import {isServer} from "solid-js/web";
import {ASSET_CDN_BASE} from "~/lib/constants";

/**
 * Translation of **game data** text (item names, descriptions, tags, …).
 *
 * This is a completely separate system from the app's own UI strings, which go through Lingui
 * (`src/lib/i18n.ts`). Game text is baked into the BSATN blobs as English, and BitCraft
 * publishes it as one CSV per locale, extracted and hosted on the same CDN as the
 * sprites. We match rows by **exact equality against the `source` column** — the `index`
 * column is not a stable join key — and apply the `translation` cell whenever it is non-empty.
 *
 * Client-only by design: the server always renders English (see `activeDataLocale` below).
 */

// ── Locales ───────────────────────────────────────────────────

/**
 * Every locale that BitCraft currently publishes, plus `en` (the implicit source — there is
 * no `en.csv`, and requesting one 404s).
 *
 * These are *filename* codes, not necessarily valid BCP-47: upstream ships Japanese as `jp.csv`,
 * where the correct tag is `ja`. The fetch path always uses the literal code from this list;
 * `displayLocaleTag()` handles the mismatch for labeling only.
 *
 * Deliberately independent of Lingui's `locales` in `lingui.config.ts`: that list only grows when
 * someone translates the *webapp's* strings, this one when upstream adds a *game data* locale.
 */
export const DATA_LOCALES = [
    "en", "de", "es", "fr", "jp", "pl", "pt-BR", "ru", "zh-Hans", "zh-Hant",
] as const;

export type DataLocale = typeof DATA_LOCALES[number];

export function isDataLocale(locale: string): locale is DataLocale {
    return (DATA_LOCALES as readonly string[]).includes(locale);
}

/** Upstream filename code → real BCP-47 tag, for `Intl.*` display purposes only. */
const DISPLAY_TAG_OVERRIDES: Record<string, string> = {
    jp: "ja",
};

/** The BCP-47 tag to hand to `Intl.DisplayNames` for a given upstream locale code. */
export function displayLocaleTag(locale: string): string {
    return DISPLAY_TAG_OVERRIDES[locale] ?? locale;
}

/**
 * The data locale corresponding to a UI locale (`UI_LOCALES` in `~/lib/i18n`) — i.e. the inverse
 * of `displayLocaleTag`. Used when the "game data language" setting is left on "same as
 * interface": the UI side speaks BCP-47 throughout, so Japanese arrives as `ja` and has to be
 * mapped back to the `jp.csv` filename code upstream actually publishes.
 *
 * Falls back to `en` for a UI locale with no game-data counterpart, which is the correct
 * degradation — English is the source text.
 */
export function dataLocaleFor(uiLocale: string): DataLocale {
    if (isDataLocale(uiLocale)) return uiLocale;
    for (const [code, tag] of Object.entries(DISPLAY_TAG_OVERRIDES)) {
        if (tag === uiLocale && isDataLocale(code)) return code;
    }
    return "en";
}

// ── Active locale ─────────────────────────────────────────────

/**
 * The data locale whose text is currently being *displayed*.
 *
 * This is a bare module-level signal rather than a Solid context on purpose: `BitCraftTable`
 * instances are constructed at module-load time (see the `BitCraftTables` object literal in
 * `spacetime.ts`), long before any provider mounts, so that layer has no component to call
 * `useContext()` from. `AppRoot` syncs it from the persisted setting with a client-only effect.
 *
 * ⚠️ **INVARIANT: `setActiveDataLocale` must NEVER be called on the server.**
 * Cloudflare Workers can interleave several requests inside one warm isolate, and this is
 * module-level mutable state — writing it per-request would leak one visitor's locale into an
 * unrelated concurrent response. That is safe today only because nothing on the server path
 * touches it, so SSR always reads the `"en"` default. If SSR is ever made locale-aware (e.g. from
 * `Accept-Language`), it must NOT be done by writing this signal; it needs a genuinely
 * per-request mechanism (request-scoped context) instead.
 */
const [activeDataLocale, setActiveDataLocaleInternal] = createSignal<string>("en");

/**
 * The locale the user has *asked* for, which runs ahead of `activeDataLocale` while its CSV
 * downloads. Kept separate so the display locale only ever advances to a locale whose
 * translations are actually in hand — otherwise every switch rendered a full frame of English
 * first (`activeDataLocale` flips, `translationsFor()` is still `undefined`, everything falls
 * back), then re-rendered again when the CSV landed. One visible update instead of two.
 */
const [requestedDataLocale, setRequestedDataLocale] = createSignal<string>("en");

export {activeDataLocale, requestedDataLocale};

/** True while a locale switch is waiting on its CSV. Drives the "loading…" hint in Settings. */
export function dataTranslationsPending(): boolean {
    return requestedDataLocale() !== activeDataLocale();
}

export function setActiveDataLocale(locale: string): void {
    if (isServer) {
        // Fail loudly rather than silently corrupting a concurrent request — see the invariant above.
        throw new Error("[data-translation] setActiveDataLocale() must not be called on the server.");
    }
    setRequestedDataLocale(locale);
}

// ── Standalone string translation ─────────────────────────────

/**
 * Translates one game string by exact source match, for text that isn't reachable through
 * `translateRow`. Two cases:
 *
 *  1. **Values nested inside a row.** `translateRow` only rewrites top-level string fields, so
 *     sum-type tags — `ItemDesc.rarity.tag`, `CsvStatEntry.id.tag` — never pass through it. Those
 *     tags are also load-bearing identity (rarity drives frame/border colors, stat tags are
 *     filter keys), so they must *stay* tags in the data and be translated only for display.
 *     See `~/lib/game-strings` for the tag → official English name step that has to happen first.
 *  2. **App labels that mirror in-game wording.** Most sidebar titles are the game's own
 *     compendium section names; reusing the game's translation keeps them consistent with the
 *     client instead of inventing a second wording. See `gameText()` in `~/lib/labels`.
 *
 * Reactive: reads `activeDataLocale` and the locale's map, so call it inside a computation or JSX.
 * Returns `source` unchanged under `en`, while a CSV is loading, or on any miss.
 */
export function translateGameText(source: string): string {
    if (!source) return source;
    const locale = activeDataLocale();
    if (locale === "en") return source;
    return translationsFor(locale)()?.get(source) ?? source;
}

// ── Translatable fields ───────────────────────────────────────

/**
 * Which game-data fields carry player-facing prose.
 *
 * Derived by hand from `npm run i18n:audit-fields` (`scripts/i18n/list-translatable-fields.mjs`),
 * which lists every string-typed field across every table with real sample values. Of the 34
 * distinct string field names, these are the ones a player actually reads. Everything else is an
 * asset path (`iconAssetName`, `modelAddress`, …), an animation/VFX identifier (`animatorState`,
 * `hitVfx`, …) or a raw style value (`color`, `emission`, `variantMaterial`) and must be left
 * alone — mangling those breaks sprites, not just text.
 *
 * An allow-list, not a deny-list, because it is both shorter *and* fail-safe: a new asset-path
 * field appearing upstream is ignored by default rather than silently corrupted. Re-run the audit
 * script after a data update to see whether anything new belongs here.
 */
export const TRANSLATABLE_FIELDS: ReadonlySet<string> = new Set([
    // Ubiquitous display text.
    "name",           // 29 tables
    "description",    // 16 tables
    "tag",            //  7 tables — category labels shown in tables/filters
    "title",          //  SkillDesc, KnowledgeScrollDesc
    "verbPhrase",     //  ExtractionRecipeDesc, PlaceableInteractionDesc — "Mine", "Chop", "Fish"
    "actions",        //  BuildingTypeDesc (string[]) — "Craft", "Open Bank"
    "content",        //  KnowledgeScrollDesc — lore prose
    "hazardLevel",    //  BiomeDesc — "Blazing Heat", "Freezing Cold"
    "stringContext",  //  ItemConversionRecipeDesc — "Convert", "Empty Bucket"
    "displayString",  //  CollectibleDesc — "[GM]", "[MOD]"
    // ProspectingDesc player-facing messages.
    "breadcrumbFoundMessage",
    "breadcrumbFoundBySomeoneElseMessage",
    "resourceUncoveredMessage",
    "resourceUncoveredBySomeoneElseMessage",
]);

/** A translatable field on a specific table, resolved once from the table's AlgebraicType. */
export type TranslatableField = {
    name: string;
    /** `true` for `string[]` fields (only `BuildingTypeDesc.actions` today). */
    isArray: boolean;
};

/**
 * Reflects on a table's product type and returns the subset of `TRANSLATABLE_FIELDS` that
 * actually exists on it as a string (or string array). Resolving this once per table keeps
 * `translateRow` down to a couple of map lookups per row instead of probing 14 names.
 *
 * Reflection is only used to *narrow* the hand-reviewed list to what a table really has — it
 * never decides on its own that a field is translatable.
 */
export function translatableFieldsOf(type: AlgebraicType): TranslatableField[] {
    const elements: any[] = (type as any).product?.elements ?? [];
    const fields: TranslatableField[] = [];
    for (const element of elements) {
        if (!TRANSLATABLE_FIELDS.has(element.name)) continue;
        const algebraicType = element.algebraicType;
        if (algebraicType?.type === "String") {
            fields.push({name: element.name, isArray: false});
        } else if (algebraicType?.type === "ArrayType" && algebraicType.array?.type === "String") {
            fields.push({name: element.name, isArray: true});
        }
    }
    return fields;
}

// ── Source-value escape hatch ─────────────────────────────────

/**
 * Attached to every translated row so the original English row stays reachable. A symbol key
 * can't collide with a game field and is skipped by `JSON.stringify`/`Object.keys`, so table
 * columns, search indexing and serialization never see it.
 */
const SOURCE_ROW = Symbol("brico.sourceRow");

/**
 * Returns the untranslated (English) version of a row.
 *
 * Use this — and *only* this — wherever code compares a game-data value against a hardcoded
 * English literal, e.g. `sourceRow(resource).tag === "World Event"`. Those comparisons are
 * matching a canonical game concept, not text the user reads, so they must not follow the
 * display locale. Rows that were never translated (English, or no CSV match) are returned as-is.
 */
export function sourceRow<T>(row: T): T {
    return (row as any)?.[SOURCE_ROW] ?? row;
}

/**
 * Returns a copy of `row` with each translatable field replaced by its translation, or `row`
 * itself when nothing matched (keeping row identity stable for downstream memos/keys).
 */
export function translateRow<T extends object>(row: T, fields: TranslatableField[], map: Map<string, string>): T {
    let translated: any = undefined;

    for (const field of fields) {
        const value = (row as any)[field.name];

        if (field.isArray) {
            if (!Array.isArray(value) || value.length === 0) continue;
            let replaced: string[] | undefined;
            for (let i = 0; i < value.length; i++) {
                const hit = typeof value[i] === "string" ? map.get(value[i]) : undefined;
                if (hit === undefined) continue;
                replaced ??= [...value];
                replaced[i] = hit;
            }
            if (replaced) {
                translated ??= {...row, [SOURCE_ROW]: row};
                translated[field.name] = replaced;
            }
            continue;
        }

        if (typeof value !== "string" || value.length === 0) continue;
        const hit = map.get(value);
        if (hit === undefined) continue;
        translated ??= {...row, [SOURCE_ROW]: row};
        translated[field.name] = hit;
    }

    return (translated as T) ?? row;
}

// ── CSV loading ───────────────────────────────────────────────

type TranslationRow = {
    index?: string;
    source?: string;
    translation?: string;
    /**
     * Parsed but deliberately unused for v1: a translation is applied whether or not it has been
     * validated upstream, so partially-reviewed locales are still useful. A future
     * "hide unvalidated translations" setting would read this.
     */
    validated?: string;
};

/**
 * Per-locale `source` → `translation` maps. Reactive so consumers re-run once a fetch lands, and
 * memoized so a locale is only ever downloaded once per session (switching away and back is free).
 */
const localeMaps = new Map<string, {
    read: Accessor<Map<string, string> | undefined>;
    write: (map: Map<string, string>) => void;
}>();

async function fetchTranslations(locale: string): Promise<Map<string, string>> {
    const url = `${ASSET_CDN_BASE}/I18N/${encodeURIComponent(locale)}.csv`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`[data-translation] failed to fetch ${url}: ${response.status}`);
    }
    const csv = await response.text();

    // The upstream files contain quoted fields with embedded commas (and occasionally newlines),
    // so this needs a real RFC4180 parser rather than a split on ",".
    //
    // d3-dsv rather than papaparse: papaparse ships a Blob-worker helper that stringifies a module
    // factory containing a nested `"undefined"` literal, which Nitro's Rollup parser fails to
    // parse — it breaks the cloudflare-pages build outright, and does so even behind a dynamic
    // import, since the bundler still walks the module. d3-dsv is plain ESM, equally RFC4180-
    // correct, and the project already depends on the d3 family.
    // see: https://github.com/nitrojs/nitro/issues/3071
    const rows = csvParse(csv) as unknown as TranslationRow[];

    const map = new Map<string, string>();
    for (const row of rows) {
        const source = row.source;
        const translation = row.translation;
        if (!source || !translation) continue;
        // First occurrence wins — upstream files do contain repeated sources.
        if (!map.has(source)) map.set(source, translation);
    }
    return map;
}

/**
 * Reactive accessor for a locale's translation map, kicking off the download on first request.
 * Resolves to `undefined` while loading (and permanently, if the fetch fails) — callers treat
 * that as "no translations yet" and keep showing English, so a CDN hiccup degrades instead of
 * breaking.
 */
export function translationsFor(locale: string): Accessor<Map<string, string> | undefined> {
    // `en` is the source text itself, and the server never leaves `en` (see the invariant above),
    // so neither ever needs a CSV.
    if (isServer || locale === "en") return () => undefined;

    const existing = localeMaps.get(locale);
    if (existing) return existing.read;

    const [read, write] = createSignal<Map<string, string> | undefined>(undefined);
    localeMaps.set(locale, {read, write: map => write(map)});

    void fetchTranslations(locale)
        .then(map => write(map))
        .catch(e => {
            // Leave the signal `undefined` so every consumer keeps rendering English.
            console.error(`[data-translation] ${locale} translations unavailable, staying on English:`, e);
            setFailedLocales(prev => new Set(prev).add(locale));
        });

    return read;
}

/**
 * Locales whose CSV fetch failed. A signal, not a plain `Set`, so the promotion effect below can
 * stop waiting on a download that is never going to arrive.
 */
const [failedLocales, setFailedLocales] = createSignal<ReadonlySet<string>>(new Set());

// ── Deferred locale promotion ─────────────────────────────────

// Promote `requestedDataLocale` → `activeDataLocale` once that locale's map is in hand, so a
// switch produces exactly one visible update instead of a flash of English followed by the real
// translation. Placed at the bottom of the module because it reads `translationsFor`, whose
// `localeMaps` backing store is a `const` declared above it.
//
// `createRoot` because this lives at module scope with no component to own it, and it must never
// be disposed. Guarded on `isServer` because the server must touch neither signal (see the
// invariant on `activeDataLocale`) and effects don't run there anyway.
if (!isServer) {
    createRoot(() => {
        createEffect(() => {
            const locale = requestedDataLocale();
            // English is the source text — nothing to download, switch immediately.
            if (locale === "en") {
                setActiveDataLocaleInternal("en");
                return;
            }
            // Reading the accessor both starts the download and subscribes this effect to it, so
            // the promotion happens on its own once the CSV parses.
            //
            // A failed fetch is promoted too, rather than waited on forever: with no map,
            // `BitCraftTable.get` fast-paths to the raw English rows, which is the intended
            // degradation — and it lets `dataTranslationsPending()` settle instead of leaving a
            // permanent "loading" hint in Settings.
            if (translationsFor(locale)() !== undefined || failedLocales().has(locale)) {
                setActiveDataLocaleInternal(locale);
            }
        });
    });
}
