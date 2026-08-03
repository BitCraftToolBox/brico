import {formatter} from "@lingui/format-po";
import {defineConfig} from "@lingui/solid/config";

/**
 * UI-string catalogs (Lingui).
 *
 * Mirrors the languages BitCraft ships, so Crowdin has somewhere to deliver every one of them.
 * Keep in sync with `UI_LOCALES` in `src/lib/i18n.ts` — this list decides which catalogs
 * extraction writes, that one which the app is willing to activate.
 *
 * Still a SEPARATE list from `DATA_LOCALES` in `src/lib/data-translation.ts`, which holds the
 * upstream CSV *filenames* for game text (Japanese ships there as the non-BCP-47 `jp`) and only
 * changes when BitCraft publishes a new one. These are BCP-47.
 *
 * Locales other than `en` may well be entirely untranslated: an empty `msgstr` falls back to the
 * message id, which *is* the English source string, so an untranslated catalog renders as English.
 */
export default defineConfig({
    locales: ["en", "de", "es", "fr", "ja", "pl", "pt-BR", "ru", "zh-Hans", "zh-Hant", "zu"],
    sourceLocale: "en",
    orderBy: "messageId",
    format: formatter({lineNumbers: false}),
    catalogs: [
        {
            path: "src/locales/{locale}/messages",
            include: ["src"],
        },
    ],
});
