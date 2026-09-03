import {ColorModeStorageManager, ConfigColorMode} from "@kobalte/core";
import {ColumnFiltersState, PaginationState, SortingState} from "@tanstack/solid-table";
import {Accessor, createContext, createEffect, createMemo, createSignal, JSX, onCleanup, onMount, Setter, useContext} from "solid-js";
import {isServer} from "solid-js/web";
import {dataLocaleFor, isDataLocale} from "~/lib/data-translation";
import {crowdinTargetUILocale, DEFAULT_UI_LOCALE, detectUILocale, isUILocale, PSEUDOLOCALE_ENABLED, type UILocale} from "~/lib/i18n";
import type {ProgressionUnlock} from "~/lib/progression";
import {ALL_SIDEBAR_HREFS} from "~/lib/sidebar-items";

/**
 * Sentinel stored in place of a locale to mean "derive it": the browser's preferred language for
 * the UI, the UI language for game data.
 *
 * Persisted as the sentinel rather than as the resolved tag on purpose — otherwise a user who
 * changed browsers or interface language would stay pinned to whatever was resolved once. It also
 * keeps the persisted default free of anything client-specific, which is what lets `persist()`
 * hand the same default to the server and to the first client render.
 */
export const AUTO_LOCALE = "auto";

export type SortMode = "tree" | "az";
export type ViewMode = "list" | "grid";

export type NaturalSortOrder = "pk" | "db";

/** Session-only (non-persisted) state for a single data table. */
export type TableSessionState = {
    columnFilters: Accessor<ColumnFiltersState>;
    setColumnFilters: Setter<ColumnFiltersState>;
    sorting: Accessor<SortingState>;
    setSorting: Setter<SortingState>;
    pagination: Accessor<PaginationState>;
    setPagination: Setter<PaginationState>;
    globalFilter: Accessor<string>;
    setGlobalFilter: Setter<string>;
};

export type AppSettings = {
    /** Color mode storage manager */
    colorStorageManager: ColorModeStorageManager;
    midnightDark: () => boolean;
    setMidnightDark: (midnight: boolean) => void;
    /** Show/hide sort/view/favorite buttons */
    showSidebarControls: () => boolean;
    setShowSidebarControls: (s: boolean) => void;
    /** Sidebar is collapsed on initial load */
    sidebarStartsCollapsed: () => boolean;
    setSidebarStartsCollapsed: (s: boolean) => void;
    /** Sidebar sort order */
    sidebarSort: () => SortMode;
    setSidebarSort: (v: SortMode) => void;
    /** Sidebar item view */
    sidebarView: () => ViewMode;
    setSidebarView: (v: ViewMode) => void;
    /** When true the sidebar only renders favorites */
    sidebarFavoritesOnly: () => boolean;
    setSidebarFavoritesOnly: (v: boolean) => void;
    /**
     * Raw persisted list — hrefs explicitly hidden by the user.
     * Any href NOT in this list is considered a favorite (new items are favorites by default).
     */
    sidebarHiddenItems: () => string[];
    setSidebarHiddenItems: (v: string[]) => void;
    /**
     * Derived: all known hrefs minus hidden ones.
     * Setting this recomputes hiddenItems = allHrefs - newFavorites.
     */
    sidebarFavorites: () => string[];
    setSidebarFavorites: (favorites: string[]) => void;
    /** Default collapse groups on load */
    sidebarCollapsedGroups: () => string[];
    setSidebarCollapsedGroups: (v: string[]) => void;
    /** Default rows per page for all data tables */
    tablePageSize: () => number;
    setTablePageSize: (v: number) => void;
    /** Per-table hidden column IDs. Key = table name, value = list of hidden column IDs. */
    tableHiddenColumns: () => Record<string, string[]>;
    setTableHiddenColumns: (v: Record<string, string[]>) => void;
    /** Show row action buttons in the first column instead of the last */
    tableActionsFirst: () => boolean;
    setTableActionsFirst: (v: boolean) => void;
    /** Default sort for tables is primary key or database order */
    tableNaturalSort: () => NaturalSortOrder;
    setTableNaturalSort: (v: NaturalSortOrder) => void;

    /**
     * Language for the app's *own* UI strings (Lingui) — one of `UI_LOCALES` from `~/lib/i18n`, or
     * the sentinel `AUTO_LOCALE` meaning "follow the browser". Read `resolvedUILocale()` to get an
     * actual locale; this raw accessor exists so the Settings UI can show which option is selected.
     */
    uiLocale: () => string;
    setUILocale: (v: string) => void;
    /** `uiLocale()` with `AUTO_LOCALE` resolved against the browser's preferred languages. */
    resolvedUILocale: () => UILocale;

    /**
     * Locale used for *game data* text (item names, descriptions, …) — one of `DATA_LOCALES`
     * from `~/lib/data-translation`, or `AUTO_LOCALE` meaning "same as the interface language".
     * Distinct from the UI language: a locale whose community translation is patchy is still worth
     * reading the interface in, so the two can be set independently.
     */
    dataLocale: () => string;
    setDataLocale: (v: string) => void;
    /** `dataLocale()` with `AUTO_LOCALE` resolved from `resolvedUILocale()`. */
    resolvedDataLocale: () => string;

    /** Quest chain IDs the user has marked as completed. */
    completedQuests: () => Set<number>;
    setCompletedQuests: (ids: number[]) => void;

    easterEggs: () => boolean;
    setEasterEggs: (v: boolean) => void;
    tf2Mode: () => boolean;
    setTf2Mode: (v: boolean) => void;
    r9Mode: () => boolean;
    setR9Mode: (v: boolean) => void;
    rishEmulation: () => boolean;
    setRishEmulation: (v: boolean) => void;

    /**
     * Raw persisted list — `ProgressionUnlock` kinds explicitly hidden by the user on the skill
     * Progression tab. Any kind NOT in this list is shown (new kinds are shown by default). Shared
     * across all skills.
     */
    progressionHiddenTypes: () => ProgressionUnlock["kind"][];
    setProgressionHiddenTypes: (v: ProgressionUnlock["kind"][]) => void;
    /** Progression tab's stat-total target level, per skill id. */
    progressionTargetLevels: () => Record<number, number>;
    setProgressionTargetLevels: (v: Record<number, number>) => void;

    // unpersisted settings

    /** Show probabilistic item stack %s and item list averages as expected value for full node instead. NOT PERSISTED for now. */
    displayProbabilityAsAverage: () => boolean;
    setDisplayProbabilityAsAverage: (b: boolean) => void;
    /** Flatten item list outputs by recursively expanding inner item lists into a single averaged list. NOT PERSISTED. */
    flattenItemListOutputs: () => boolean;
    setFlattenItemListOutputs: (b: boolean) => void;

    /**
     * Returns (or lazily creates) the session-only table state signals for the given table name.
     * These are NOT persisted and reset on page reload.
     */
    getTableSession: (name: string) => TableSessionState;
};

/** All localStorage keys and defaults in one place */
export const KEYS = {
    theme: "brico:theme",
    midnightDark: "brico:theme:midnightDark",
    sidebarShowControls: "brico:sidebar:show-controls",
    sidebarStartsCollapsed: "brico:sidebar:starts-collapsed",
    sidebarSort: "brico:sidebar:sort",
    sidebarView: "brico:sidebar:view",
    sidebarFavoritesOnly: "brico:sidebar:favorites-only",
    sidebarHiddenItems: "brico:sidebar:hidden-items",
    sidebarCollapsedGroups: "brico:sidebar:collapsed-groups",
    tablePageSize: "brico:table:page-size",
    tableHiddenColumns: "brico:table:hidden-columns",
    tableActionsFirst: "brico:table:actions-first",
    tableNaturalSort: "brico:table:natural-sort",
    uiLocale: "brico:ui-locale",
    dataLocale: "brico:data-locale",
    completedQuests: "brico:quests:completed",
    easterEggs: "brico:easter-eggs",
    tf2Mode: "brico:easter-eggs:tf2-mode",
    r9Mode: "brico:easter-eggs:r9-mode",
    rishEmulation: "brico:easter-eggs:rish-emulation",
    // unchartedNotifications: "brico:uncharted:notifications",
    progressionHiddenTypes: "brico:progression:hidden-types",
    progressionTargetLevels: "brico:progression:target-levels",
} as const;

/**
 * SSR-safe persisted signal. On the server, and at the first client render, it holds the
 * provided default so server-rendered and hydrated markup match exactly. After mount it reads
 * the saved value from localStorage (applying it with a brief post-hydration update) and writes
 * subsequent changes back. Must be called during a component's render — createSettings() is.
 */
function persist<T>([get, set]: [Accessor<T>, Setter<T>], name: string): [Accessor<T>, Setter<T>] {
    if (!isServer) {
        onMount(() => {
            try {
                const raw = localStorage.getItem(name);
                if (raw != null) set(() => JSON.parse(raw) as T);
            } catch { /* malformed or unavailable — keep default */ }
            // Start write-through only after the initial read so we never clobber the saved value.
            createEffect(() => {
                try {
                    localStorage.setItem(name, JSON.stringify(get()));
                } catch { /* storage unavailable — ignore */ }
            });
        });
    }
    return [get, set];
}

/**
 * Raw (non-JSON) localStorage-backed signal for the color-mode `theme` value. It must match
 * the plain, unquoted string format the pre-hydration ColorModeScript reads/writes — the
 * generic `persist()` above JSON-encodes everything (so a saved "dark" is literally the
 * 6-character string `"dark"`), which the script's raw `localStorage.getItem()` can't parse:
 * it ends up assigning `style.colorScheme = '"dark"'`, an invalid CSS value the CSSOM silently
 * drops, while `dataset.kbTheme` happily stores the garbled value anyway.
 *
 * Unlike `persist()`, the client's initial value is read synchronously (not deferred to
 * onMount): theme has no server-rendered markup to stay consistent with, since the
 * ColorModeScript already applies it to <html> before hydration runs. Deferring it would
 * leave `ColorModeProvider`'s own initial value resolving to the OS color-scheme preference
 * for one tick, causing a visible flash whenever the saved theme differs from it.
 */
function persistThemeRaw(key: string): [Accessor<ConfigColorMode>, Setter<ConfigColorMode>] {
    let initial: ConfigColorMode = "system";
    if (!isServer) {
        try {
            initial = (localStorage.getItem(key) as ConfigColorMode) || "system";
        } catch { /* storage unavailable — keep default */ }
    }

    const [theme, setTheme] = createSignal<ConfigColorMode>(initial);

    if (!isServer) {
        createEffect(() => {
            try {
                localStorage.setItem(key, theme());
            } catch { /* storage unavailable — ignore */ }
        });
    }

    return [theme, setTheme];
}

function createSettings(): AppSettings {

    // cross-tab sync
    type PersistedSync<T> = { key: string; get: Accessor<T>; set: (v: T) => void; raw?: boolean };
    const persistedSyncs: PersistedSync<any>[] = [];

    const onStorageChange = (e: StorageEvent) => {
        if (!e.newValue) return;
        for (const sync of persistedSyncs) {
            if (e.key !== sync.key) continue;
            try {
                // prevent looping — theme is stored raw (unquoted), everything else JSON-encoded
                const parsed = sync.raw ? e.newValue : JSON.parse(e.newValue);
                if (parsed !== sync.get()) sync.set(parsed);
            } catch {
                // malformed value in storage — ignore
            }
            break;
        }
    };
    if (!isServer) {
        window.addEventListener("storage", onStorageChange);
        onCleanup(() => window.removeEventListener("storage", onStorageChange));
    }

    // persisted signals

    // theme
    const [theme, setTheme] = persistThemeRaw(KEYS.theme);
    const [midnightDark, setMidnightDark] = persist(createSignal<boolean>(false), KEYS.midnightDark);

    // sidebar
    const [showSidebarControls, setShowSidebarControls] = persist(createSignal(true), KEYS.sidebarShowControls);
    const [sidebarStartsCollapsed, setSidebarStartsCollapsed] = persist(createSignal(false), KEYS.sidebarStartsCollapsed);
    const [sidebarSort, setSidebarSort] = persist(createSignal<SortMode>("tree"), KEYS.sidebarSort);
    const [sidebarView, setSidebarView] = persist(createSignal<ViewMode>("list"), KEYS.sidebarView);
    const [sidebarFavoritesOnly, setSidebarFavoritesOnly] = persist(createSignal<boolean>(false), KEYS.sidebarFavoritesOnly);
    const [sidebarHiddenItems, setSidebarHiddenItems] = persist(createSignal<string[]>([]), KEYS.sidebarHiddenItems);
    const [sidebarCollapsedGroups, setSidebarCollapsedGroups] = persist(createSignal<string[]>([]), KEYS.sidebarCollapsedGroups);

    // tables
    const [tablePageSize, setTablePageSize] = persist(createSignal<number>(10), KEYS.tablePageSize);
    const [tableHiddenColumns, setTableHiddenColumns] = persist(createSignal<Record<string, string[]>>({}), KEYS.tableHiddenColumns);
    const [tableActionsFirst, setTableActionsFirst] = persist(createSignal(false), KEYS.tableActionsFirst);
    const [tableNaturalSort, setTableNaturalSort] = persist(createSignal<NaturalSortOrder>("pk"), KEYS.tableNaturalSort);

    // language — both default to AUTO_LOCALE, i.e. follow the browser, and game data follows the UI
    const [uiLocale, setUILocale] = persist(createSignal<string>(AUTO_LOCALE), KEYS.uiLocale);
    const [dataLocale, setDataLocale] = persist(createSignal<string>(AUTO_LOCALE), KEYS.dataLocale);

    // game data?
    const [completedQuestsRaw, setCompletedQuestsRaw] = persist(createSignal<number[]>([]), KEYS.completedQuests);

    // easter eggs
    const [easterEggs, setEasterEggs] = persist(createSignal<boolean>(false), KEYS.easterEggs);
    const [tf2Mode, setTf2Mode] = persist(createSignal<boolean>(false), KEYS.tf2Mode);
    const [r9Mode, setR9Mode] = persist(createSignal<boolean>(false), KEYS.r9Mode);
    const [rishEmulation, setRishEmulation] = persist(createSignal<boolean>(false), KEYS.rishEmulation);

    // progression tab
    const [progressionHiddenTypes, setProgressionHiddenTypes] = persist(createSignal<ProgressionUnlock["kind"][]>([]), KEYS.progressionHiddenTypes);
    const [progressionTargetLevels, setProgressionTargetLevels] = persist(createSignal<Record<number, number>>({}), KEYS.progressionTargetLevels);

    // derived signals

    // theme
    const colorStorageManager: ColorModeStorageManager = {
        ssr: false,
        type: "localStorage",
        get(init?) {
            return theme() ?? init ?? "system";
        },
        set(value) {
            setTheme(value);
        }
    };

    // sidebar
    const sidebarFavorites = createMemo(() =>
        ALL_SIDEBAR_HREFS.filter(h => !sidebarHiddenItems().includes(h))
    );
    const setSidebarFavorites = (favorites: string[]) => {
        setSidebarHiddenItems(ALL_SIDEBAR_HREFS.filter(h => !favorites.includes(h)));
    };

    // language
    //
    // Under Crowdin's in-context editor (`PSEUDOLOCALE_ENABLED`), both resolved locales ignore
    // the persisted setting entirely rather than merely defaulting: a translator's browser may
    // carry a `uiLocale`/`dataLocale` saved from an earlier, ordinary visit to the site, and
    // without this override that stale preference — not the pseudolocale / target-language pair
    // the review session needs — would win. Forcing at the *resolved* layer (rather than e.g.
    // only changing what "auto" means) also means flipping the Settings selects during a review
    // session can't desync the two systems either.
    const resolvedUILocale = createMemo<UILocale>(() => {
        if (PSEUDOLOCALE_ENABLED) return "zu";
        const stored = uiLocale();
        return isUILocale(stored) ? stored : detectUILocale();
    });
    const resolvedDataLocale = createMemo<string>(() => {
        if (PSEUDOLOCALE_ENABLED) return dataLocaleFor(crowdinTargetUILocale() ?? DEFAULT_UI_LOCALE);
        const stored = dataLocale();
        // Anything unrecognized — the AUTO_LOCALE sentinel, but also a locale dropped from
        // DATA_LOCALES upstream — follows the UI language rather than requesting a CSV that 404s.
        return isDataLocale(stored) ? stored : dataLocaleFor(resolvedUILocale());
    });

    // game data
    const completedQuests = createMemo(() => new Set(completedQuestsRaw()));
    const setCompletedQuests = (ids: number[]) => setCompletedQuestsRaw(ids);


    // non-persisted signals

    const [displayProbabilityAsAverage, setDisplayProbabilityAsAverage] = createSignal(false);
    const [flattenItemListOutputs, setFlattenItemListOutputs] = createSignal(false);

    // Session-only table state — keyed by table name
    const tableSessions = new Map<string, TableSessionState>();
    const getTableSession = (name: string): TableSessionState => {
        if (!tableSessions.has(name)) {
            const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>([]);
            const [sorting, setSorting] = createSignal<SortingState>([]);
            const [pagination, setPagination] = createSignal<PaginationState>({pageSize: tablePageSize(), pageIndex: 0});
            const [globalFilter, setGlobalFilter] = createSignal('');
            tableSessions.set(name, {
                columnFilters, setColumnFilters, sorting, setSorting,
                pagination, setPagination, globalFilter, setGlobalFilter
            });
        }
        return tableSessions.get(name)!;
    };


    // Register all persisted signals for cross-tab synchronization.
    persistedSyncs.push(
        {key: KEYS.theme, get: theme, set: setTheme, raw: true},
        {key: KEYS.midnightDark, get: midnightDark, set: setMidnightDark},
        {key: KEYS.sidebarShowControls, get: showSidebarControls, set: setShowSidebarControls},
        {key: KEYS.sidebarSort, get: sidebarSort, set: setSidebarSort},
        {key: KEYS.sidebarView, get: sidebarView, set: setSidebarView},
        {key: KEYS.sidebarFavoritesOnly, get: sidebarFavoritesOnly, set: setSidebarFavoritesOnly},
        {key: KEYS.sidebarHiddenItems, get: sidebarHiddenItems, set: setSidebarHiddenItems},
        {key: KEYS.tablePageSize, get: tablePageSize, set: setTablePageSize},
        {key: KEYS.tableActionsFirst, get: tableActionsFirst, set: setTableActionsFirst},
        {key: KEYS.tableNaturalSort, get: tableNaturalSort, set: setTableNaturalSort},
        {key: KEYS.uiLocale, get: uiLocale, set: setUILocale},
        {key: KEYS.dataLocale, get: dataLocale, set: setDataLocale},
        {key: KEYS.completedQuests, get: completedQuestsRaw, set: setCompletedQuestsRaw},
        {key: KEYS.easterEggs, get: easterEggs, set: setEasterEggs},
        {key: KEYS.tf2Mode, get: tf2Mode, set: setTf2Mode},
        {key: KEYS.r9Mode, get: r9Mode, set: setR9Mode},
        {key: KEYS.rishEmulation, get: rishEmulation, set: setRishEmulation},
        {key: KEYS.progressionHiddenTypes, get: progressionHiddenTypes, set: setProgressionHiddenTypes},
        {key: KEYS.progressionTargetLevels, get: progressionTargetLevels, set: setProgressionTargetLevels},
    );

    return {
        colorStorageManager,
        midnightDark,
        setMidnightDark,
        showSidebarControls,
        setShowSidebarControls,
        sidebarStartsCollapsed,
        setSidebarStartsCollapsed,
        sidebarSort,
        setSidebarSort,
        sidebarView,
        setSidebarView,
        sidebarFavoritesOnly,
        setSidebarFavoritesOnly,
        sidebarHiddenItems,
        setSidebarHiddenItems,
        sidebarCollapsedGroups,
        setSidebarCollapsedGroups,
        sidebarFavorites,
        setSidebarFavorites,
        tablePageSize,
        setTablePageSize,
        tableHiddenColumns,
        setTableHiddenColumns,
        tableActionsFirst,
        setTableActionsFirst,
        tableNaturalSort,
        setTableNaturalSort,
        uiLocale,
        setUILocale,
        resolvedUILocale,
        dataLocale,
        setDataLocale,
        resolvedDataLocale,
        displayProbabilityAsAverage,
        setDisplayProbabilityAsAverage,
        flattenItemListOutputs,
        setFlattenItemListOutputs,
        completedQuests,
        setCompletedQuests,
        easterEggs,
        setEasterEggs,
        tf2Mode,
        setTf2Mode,
        r9Mode,
        setR9Mode,
        rishEmulation,
        setRishEmulation,
        progressionHiddenTypes,
        setProgressionHiddenTypes,
        progressionTargetLevels,
        setProgressionTargetLevels,
        getTableSession,
    };
}

// ── Context ───────────────────────────────────────────────────

const SettingsContext = createContext<AppSettings>();

export function SettingsProvider(props: { children: JSX.Element }) {
    const settings = createSettings();
    return (
        <SettingsContext.Provider value={settings}>
            {props.children}
        </SettingsContext.Provider>
    );
}

export function useSettings(): AppSettings {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettings() must be used within a <SettingsProvider>");
    return ctx;
}
