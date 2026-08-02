import {throttle} from "@solid-primitives/scheduled";
import {Accessor, createMemo, createSignal, For, onCleanup, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "~/components/ui/table";
import {TextField, TextFieldInput} from "~/components/ui/text-field";
import {DATA_LOCALES, type DataLocale, displayLocaleTag, translationsFor} from "~/lib/data-translation";
import {compareText, PSEUDOLOCALE_ENABLED, UI_LOCALES, type UILocale} from "~/lib/i18n";
import rawDe from "~/locales/de/messages.po?raw";
import rawEn from "~/locales/en/messages.po?raw";
import rawEs from "~/locales/es/messages.po?raw";
import rawFr from "~/locales/fr/messages.po?raw";
import rawJa from "~/locales/ja/messages.po?raw";
import rawPl from "~/locales/pl/messages.po?raw";
import rawPtBR from "~/locales/pt-BR/messages.po?raw";
import rawRu from "~/locales/ru/messages.po?raw";
import rawZhHans from "~/locales/zh-Hans/messages.po?raw";
import rawZhHant from "~/locales/zh-Hant/messages.po?raw";
import rawPseudoLocale from "~/locales/zu/messages.po?raw";

/**
 * `/tools/translations` — debug-only route, deliberately not linked from anywhere. Lets someone
 * search across every collated translation string (game data + UI) in one place instead of
 * jumping between the 9 upstream CSVs and 10 Lingui catalogs. See `I18N_PLAN.md`.
 */

const MAX_ROWS = 300;

function localeLabel(locale: string): string {
    if (PSEUDOLOCALE_ENABLED && locale === "zu") return "Pseudolocale (for Crowdin)";
    const tag = displayLocaleTag(locale);
    try {
        return new Intl.DisplayNames([tag], {type: "language"}).of(tag) ?? locale;
    } catch {
        return locale;
    }
}

// ── UI strings (Lingui) ──────────────────────────────────────────
//
// Parsed straight from the `.po` source rather than the compiled catalogs from `~/lib/i18n`:
// those compile each message into an ICU token array (not plain text) and bake an empty msgstr
// into a copy of the English msgid at compile time, which would make every locale look fully
// translated. Reading the raw file gives real text and a genuine "untranslated" signal.

/** Every `msgid`/`msgstr` pair in a catalog. Lingui always emits one pair per line — no folding. */
function parsePoMessages(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const idMatch = lines[i].match(/^msgid "(.*)"$/);
        if (!idMatch) continue;
        const strMatch = lines[i + 1]?.match(/^msgstr "(.*)"$/);
        if (!strMatch) continue;
        i++;
        const id = unescapePoString(idMatch[1]);
        if (!id) continue; // the header entry has an empty msgid
        map.set(id, unescapePoString(strMatch[1]));
    }
    return map;
}

function unescapePoString(s: string): string {
    return s.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch === "t" ? "\t" : ch));
}

const UI_CATALOGS: Record<UILocale, Map<string, string>> = {
    en: parsePoMessages(rawEn),
    de: parsePoMessages(rawDe),
    es: parsePoMessages(rawEs),
    fr: parsePoMessages(rawFr),
    ja: parsePoMessages(rawJa),
    pl: parsePoMessages(rawPl),
    "pt-BR": parsePoMessages(rawPtBR),
    ru: parsePoMessages(rawRu),
    "zh-Hans": parsePoMessages(rawZhHans),
    "zh-Hant": parsePoMessages(rawZhHant),
    ...PSEUDOLOCALE_ENABLED ? {"zu": parsePoMessages(rawPseudoLocale)} : {}
};

const UI_IDS = Array.from(UI_CATALOGS.en.keys()).sort(compareText);

function UiStringsSection(props: {query: Accessor<string>; hiddenLocales: Accessor<Set<string>>}) {
    const locales = createMemo(() => UI_LOCALES.filter((locale) => !props.hiddenLocales().has(locale)));

    const filtered = createMemo(() => {
        const q = props.query().trim().toLowerCase();
        if (!q) return UI_IDS;
        return UI_IDS.filter((id) => {
            if (id.toLowerCase().includes(q)) return true;
            for (const locale of UI_LOCALES) {
                const text = UI_CATALOGS[locale].get(id);
                if (text && text.toLowerCase().includes(q)) return true;
            }
            return false;
        });
    });
    const visible = createMemo(() => filtered().slice(0, MAX_ROWS));

    return (
        <section>
            <h2 class="text-2xl font-bold mb-1 text-foreground">UI Strings</h2>
            <p class="text-sm text-muted-foreground mb-4">
                Webapp copy from the Lingui catalogs (<code>src/locales/*/messages.po</code>). An
                empty cell means that locale has no translation yet.
            </p>
            <div class="rounded-md border max-h-[70svh] overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <For each={locales()}>
                                {(locale, i) => (
                                    <TableHead
                                        class={i() === 0 ? "sticky left-0 top-0 z-20 bg-background whitespace-nowrap" : "sticky top-0 z-10 bg-background whitespace-nowrap"}
                                    >
                                        {localeLabel(locale)} ({locale})
                                    </TableHead>
                                )}
                            </For>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <For
                            each={visible()}
                            fallback={
                                <TableRow>
                                    <TableCell colSpan={locales().length} class="text-center text-muted-foreground py-6">
                                        No matches
                                    </TableCell>
                                </TableRow>
                            }
                        >
                            {(id) => (
                                <TableRow>
                                    <For each={locales()}>
                                        {(locale, i) => {
                                            const text = () => UI_CATALOGS[locale].get(id);
                                            return (
                                                <TableCell class={i() === 0 ? "sticky left-0 bg-background font-medium max-w-md align-top" : "max-w-md align-top"}>
                                                    <Show when={text()} fallback={<span class="text-muted-foreground italic">—</span>}>
                                                        {text()}
                                                    </Show>
                                                </TableCell>
                                            );
                                        }}
                                    </For>
                                </TableRow>
                            )}
                        </For>
                    </TableBody>
                </Table>
            </div>
            <Show when={filtered().length > MAX_ROWS}>
                <p class="text-xs text-muted-foreground mt-1">
                    Showing {MAX_ROWS} of {filtered().length} matches — refine your search for more.
                </p>
            </Show>
        </section>
    );
}

// ── Game data strings ────────────────────────────────────────────

const GAME_LOCALES: DataLocale[] = DATA_LOCALES.filter((locale) => locale !== "en");

function GameStringsSection(props: {query: Accessor<string>; hiddenLocales: Accessor<Set<string>>}) {
    // Kick off every locale's CSV fetch up front — `translationsFor` memoizes per locale, so this
    // is a no-op for any locale already loaded elsewhere in the app, and reactive: reading the
    // accessor subscribes this component to the fetch landing.
    const readers = GAME_LOCALES.map((locale) => translationsFor(locale));

    const showEnglish = createMemo(() => !props.hiddenLocales().has("en"));
    const visibleLocales = createMemo(() => GAME_LOCALES.filter((locale) => !props.hiddenLocales().has(locale)));
    const columnCount = createMemo(() => (showEnglish() ? 1 : 0) + visibleLocales().length);

    const allSources = createMemo(() => {
        const sources = new Set<string>();
        for (const read of readers) {
            const map = read();
            if (!map) continue;
            for (const source of map.keys()) sources.add(source);
        }
        return Array.from(sources).sort(compareText);
    });

    const filtered = createMemo(() => {
        const q = props.query().trim().toLowerCase();
        const sources = allSources();
        if (!q) return sources;
        return sources.filter((source) => {
            if (source.toLowerCase().includes(q)) return true;
            for (const read of readers) {
                const text = read()?.get(source);
                if (text && text.toLowerCase().includes(q)) return true;
            }
            return false;
        });
    });
    const visible = createMemo(() => filtered().slice(0, MAX_ROWS));

    return (
        <section>
            <h2 class="text-2xl font-bold mb-1 text-foreground">Game Strings</h2>
            <p class="text-sm text-muted-foreground mb-4">
                Game text from BitCraft's translated CSVs. Loading every locale up
                front, so this can take a moment on first visit.
            </p>
            <div class="rounded-md border max-h-[70svh] overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <Show when={showEnglish()}>
                                <TableHead class="sticky left-0 top-0 z-20 bg-background whitespace-nowrap">
                                    {localeLabel("en")} (en)
                                </TableHead>
                            </Show>
                            <For each={visibleLocales()}>
                                {(locale) => (
                                    <TableHead class="sticky top-0 z-10 bg-background whitespace-nowrap">
                                        {localeLabel(locale)} ({locale})
                                    </TableHead>
                                )}
                            </For>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <For
                            each={visible()}
                            fallback={
                                <TableRow>
                                    <TableCell colSpan={columnCount()} class="text-center text-muted-foreground py-6">
                                        No matches
                                    </TableCell>
                                </TableRow>
                            }
                        >
                            {(source) => (
                                <TableRow>
                                    <Show when={showEnglish()}>
                                        <TableCell class="sticky left-0 bg-background font-medium max-w-md align-top">{source}</TableCell>
                                    </Show>
                                    <For each={visibleLocales()}>
                                        {(locale) => {
                                            const readerIndex = GAME_LOCALES.indexOf(locale);
                                            const text = () => readers[readerIndex]()?.get(source);
                                            return (
                                                <TableCell class="max-w-md align-top">
                                                    <Show when={text()} fallback={<span class="text-muted-foreground italic">—</span>}>
                                                        {text()}
                                                    </Show>
                                                </TableCell>
                                            );
                                        }}
                                    </For>
                                </TableRow>
                            )}
                        </For>
                    </TableBody>
                </Table>
            </div>
            <Show when={filtered().length > MAX_ROWS}>
                <p class="text-xs text-muted-foreground mt-1">
                    Showing {MAX_ROWS} of {filtered().length} matches — refine your search for more.
                </p>
            </Show>
        </section>
    );
}

// Every locale toggleable from the checkbox row below the search bar — the union of both
// systems' locale lists, in their natural (declared) order, deduped by code.
const ALL_LOCALES: string[] = Array.from(new Set<string>([...UI_LOCALES, ...DATA_LOCALES]));

// ── Page ──────────────────────────────────────────────────────────

export default function TranslationsPage() {
    const [query, setQuery] = createSignal("");
    const setQueryThrottled = throttle((value: string) => setQuery(value), 300);
    onCleanup(() => setQueryThrottled.clear());

    const [hiddenLocales, setHiddenLocales] = createSignal<Set<string>>(new Set());
    const toggleLocale = (locale: string, visible: boolean) => {
        setHiddenLocales((prev) => {
            const next = new Set(prev);
            if (visible) next.delete(locale); else next.add(locale);
            return next;
        });
    };

    return (
        <MainLayout title="Translations" hideSearch description="Debug view of collated UI and game-data translation strings.">
            <div class="w-full flex flex-col gap-8">
                <div>
                    <h1 class="text-4xl font-bold mb-4 text-foreground">Translations</h1>
                    <TextField class="max-w-md">
                        <TextFieldInput
                            placeholder="Search source or translated text…"
                            onInput={(e) => setQueryThrottled(e.currentTarget.value)}
                        />
                    </TextField>
                    <div class="flex flex-wrap gap-3 mt-3">
                        <For each={ALL_LOCALES}>
                            {(locale) => (
                                <label class="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        class="size-4 accent-primary"
                                        checked={!hiddenLocales().has(locale)}
                                        onChange={(e) => toggleLocale(locale, e.currentTarget.checked)}
                                    />
                                    {localeLabel(locale)} ({locale})
                                </label>
                            )}
                        </For>
                    </div>
                </div>

                <GameStringsSection query={query} hiddenLocales={hiddenLocales}/>
                <UiStringsSection query={query} hiddenLocales={hiddenLocales}/>
            </div>
        </MainLayout>
    );
}
