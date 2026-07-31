import {i18n, type Messages} from "@lingui/core";
import {createSignal} from "solid-js";
import {isServer} from "solid-js/web";
import {messages as messagesEn} from "~/locales/en/messages.po";

/**
 * The single Lingui instance for the app's *own* UI strings (nav labels, table headers,
 * settings copy, …). Game-data text is a separate system entirely — see
 * `src/lib/data-translation.ts`, and `~/lib/labels` for the handful of UI labels that
 * deliberately borrow the game's translation instead of getting their own.
 */

// ── Locales ───────────────────────────────────────────────────

/**
 * Whether Crowdin's pseudolocale (`zu`) and its In-Context editor script should be live:
 * in a deployed build only when `app.config.ts` sets `VITE_ENABLE_PSEUDOLOCALE` — which it
 * does for the `translate` Cloudflare Pages branch, so translators can review without a checkout,
 * or manually in development by setting the environment variable.
 * Also read by `entry-server.tsx` (to gate the Crowdin JIPT script) and the `/tools/translations`
 * debug route.
 */
export const PSEUDOLOCALE_ENABLED = import.meta.env.VITE_ENABLE_PSEUDOLOCALE === "true";

/**
 * Every locale the webapp's UI is wired for. Mirrors the languages BitCraft itself ships, so a
 * Crowdin translation can land for any of them without a code change.
 *
 * Must stay in sync with `locales` in `lingui.config.ts`: that list decides which catalogs
 * `npm run i18n:extract` writes, this one decides which the app is willing to activate.
 *
 * BCP-47 throughout, unlike `DATA_LOCALES` in `data-translation.ts` — that list holds upstream
 * *filenames*, where Japanese is the non-standard `jp`. `dataLocaleFor()` bridges the two.
 */
export const UI_LOCALES = [
    "en", "de", "es", "fr", "pl", "pt-BR", "ru", "ja", "zh-Hans", "zh-Hant", ...PSEUDOLOCALE_ENABLED ? ["zu"] : []
] as const;

export type UILocale = typeof UI_LOCALES[number];

export const DEFAULT_UI_LOCALE: UILocale = "en";

export function isUILocale(locale: string): locale is UILocale {
    return (UI_LOCALES as readonly string[]).includes(locale);
}

/**
 * Region/script tags that don't reduce to one of `UI_LOCALES` by simply dropping the subtag.
 * `de-AT` → `de` works by truncation; `zh-TW` must not become `zh-Hans`.
 */
const REGION_ALIASES: Record<string, UILocale> = {
    "zh-tw": "zh-Hant",
    "zh-hk": "zh-Hant",
    "zh-mo": "zh-Hant",
    "zh-cn": "zh-Hans",
    "zh-sg": "zh-Hans",
    "zh-hans": "zh-Hans",
    "zh-hant": "zh-Hant",
    "zh": "zh-Hans",
    "pt": "pt-BR",
    "pt-pt": "pt-BR",
};

/** Best `UI_LOCALES` match for one BCP-47 tag, or `undefined` if nothing fits. */
function matchUILocale(tag: string): UILocale | undefined {
    const lower = tag.toLowerCase();
    const exact = UI_LOCALES.find(l => l.toLowerCase() === lower);
    if (exact) return exact;
    if (REGION_ALIASES[lower]) return REGION_ALIASES[lower];
    const base = lower.split("-")[0];
    if (REGION_ALIASES[base]) return REGION_ALIASES[base];
    return UI_LOCALES.find(l => l.toLowerCase() === base);
}

/**
 * The locale to use when the setting is left on "automatic": the first of the browser's preferred
 * languages this app has a catalog list entry for, else English.
 *
 * Client-only. The server always renders English, and the persisted setting stores the literal
 * `"auto"` rather than a resolved tag, so nothing here can desync server and client markup.
 */
export function detectUILocale(): UILocale {
    if (isServer || typeof navigator === "undefined") return DEFAULT_UI_LOCALE;
    if (PSEUDOLOCALE_ENABLED) return "zu";
    const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of preferred) {
        const match = tag && matchUILocale(tag);
        if (match) return match;
    }
    return DEFAULT_UI_LOCALE;
}

// ── Catalogs ──────────────────────────────────────────────────

/**
 * Lazily-loaded catalogs, one chunk per locale.
 *
 * A glob rather than a template-literal `import()` so Vite can enumerate the candidates at build
 * time — which is also what makes dropping a new `src/locales/<locale>/messages.po` in from
 * Crowdin work with no code change beyond `UI_LOCALES` / `lingui.config.ts`. A locale listed in
 * `UI_LOCALES` with no catalog on disk simply has no entry here and is declined by
 * `activateUILocale`.
 */
const catalogs = import.meta.glob<{messages: Messages}>("../locales/*/messages.po");

// English is bundled eagerly rather than globbed: `i18n._()` has to work from module scope (e.g.
// `sidebar-items.ts` is evaluated before any component renders), and the source locale must never
// depend on a network round-trip.
i18n.load("en", messagesEn);
i18n.activate("en");

const loaded = new Set<string>(["en"]);

/**
 * The active UI locale, as a Solid signal.
 *
 * `<Trans>` and `useLingui()`'s `_`/`t` are already reactive through `I18nProvider`, so component
 * markup needs nothing from this. It exists for the *other* call sites: the plain `t` macro from
 * `@lingui/core/macro` compiles to a bare `i18n._()` against this module-global instance, which no
 * computation is subscribed to. Non-component helpers that build display names with `t`
 * (`relations.ts`, `placeables.ts`) therefore call `trackUILocale()` so the memo they run inside
 * re-evaluates on a locale change.
 *
 * Distinct from `activeDataLocale` in `data-translation.ts`, which is the *game text* locale.
 */
const [uiLocale, setUILocale] = createSignal<string>(i18n.locale);

export {uiLocale};

i18n.on("change", () => setUILocale(i18n.locale));

/** Read the active UI locale purely to depend on it. See `uiLocale`. */
export function trackUILocale(): void {
    void uiLocale();
}

// ── Collation ─────────────────────────────────────────────────

let collator: Intl.Collator | undefined;
let collatorLocale: string | undefined;

/**
 * Locale-aware comparison for sorting user-visible text — use this instead of a bare
 * `localeCompare()`, which sorts by whatever locale the *runtime* happens to default to and so
 * mis-orders diacritics (Swedish å after z, Polish ł after l, German ö with o) regardless of the
 * language on screen.
 *
 * Collated by the UI locale, which is the language the user reads in. Reactive: calling this in a
 * sort inside a computation makes that computation re-run when the locale changes. A `Collator` is
 * an order of magnitude faster than repeated `localeCompare`, so it's cached and rebuilt only on a
 * locale change.
 *
 * Not for comparisons that decide behaviour rather than order — those want the canonical English
 * value via `sourceRow()`, not a collation.
 */
export function compareText(a: string, b: string): number {
    const locale = uiLocale();
    if (!collator || collatorLocale !== locale) {
        collatorLocale = locale;
        try {
            collator = new Intl.Collator(locale);
        } catch {
            collator = new Intl.Collator();
        }
    }
    return collator.compare(a, b);
}

/** True while a locale's catalog chunk is in flight. Drives the "loading…" hint in Settings. */
const [uiLocaleLoading, setUILocaleLoading] = createSignal(false);

export {uiLocaleLoading};

/** Most recent request, so a fast double-switch can't let a slow chunk win. */
let pendingLocale: string = i18n.locale;

/**
 * Loads (once) and activates a UI locale.
 *
 * The catalog is awaited *before* `i18n.activate()`, so the UI never flashes English on its way to
 * the target language — the same reasoning as the deferred promotion of `activeDataLocale`. An
 * unknown locale, a catalog that hasn't been translated yet, or a failed chunk load all leave the
 * current locale in place rather than blanking the app.
 *
 * ⚠️ Client-only, for the same reason as `setActiveDataLocale`: `i18n` is module-level mutable
 * state and one warm Cloudflare isolate serves interleaved requests, so activating per-request
 * would leak one visitor's language into another's response. Called from an effect, which never
 * runs on the server.
 */
export async function activateUILocale(locale: string): Promise<void> {
    if (isServer) {
        throw new Error("[i18n] activateUILocale() must not be called on the server.");
    }
    if (!isUILocale(locale) || i18n.locale === locale) return;

    pendingLocale = locale;

    if (!loaded.has(locale)) {
        const load = catalogs[`../locales/${locale}/messages.po`];
        // Listed in UI_LOCALES but no catalog shipped yet — stay put rather than activating an
        // empty locale, which would render every message as its raw id.
        if (!load) return;
        setUILocaleLoading(true);
        try {
            const {messages} = await load();
            i18n.load(locale, messages);
            loaded.add(locale);
        } catch (e) {
            console.error(`[i18n] failed to load the ${locale} UI catalog, staying on ${i18n.locale}:`, e);
            return;
        } finally {
            setUILocaleLoading(false);
        }
        // A newer switch landed while this chunk was downloading; that call owns the activation.
        if (pendingLocale !== locale) return;
    }

    i18n.activate(locale);
}

export {i18n};
