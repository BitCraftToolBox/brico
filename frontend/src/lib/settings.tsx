import {ColorModeStorageManager, ConfigColorMode} from "@kobalte/core";
import {makePersisted} from "@solid-primitives/storage";
import {ColumnFiltersState, PaginationState, SortingState} from "@tanstack/solid-table";
import {Accessor, createContext, createMemo, createSignal, JSX, onCleanup, Setter, useContext} from "solid-js";
import {ALL_SIDEBAR_HREFS} from "~/lib/sidebar-items";

// ── Types ─────────────────────────────────────────────────────

export type SortMode = "tree" | "az";
export type ViewMode = "list" | "grid";

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

    /** Quest chain IDs the user has marked as completed. */
    completedQuests: () => Set<number>;
    setCompletedQuests: (ids: number[]) => void;

    easterEggs: () => boolean;
    setEasterEggs: (v: boolean) => void;
    tf2Mode: () => boolean;
    setTf2Mode: (v: boolean) => void;
    r9Mode: () => boolean;
    setR9Mode: (v: boolean) => void;

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

// ── Factory ───────────────────────────────────────────────────

/** All localStorage keys and defaults in one place */
const KEYS = {
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
    completedQuests: "brico:quests:completed",
    easterEggs: "brico:easter-eggs",
    tf2Mode: "brico:easter-eggs:tf2-mode",
    r9Mode: "brico:easter-eggs:r9-mode",
} as const;

function createSettings(): AppSettings {

    // cross-tab sync
    type PersistedSync<T> = { key: string; get: Accessor<T>; set: (v: T) => void };
    const persistedSyncs: PersistedSync<any>[] = [];

    const onStorageChange = (e: StorageEvent) => {
        if (!e.newValue) return;
        for (const sync of persistedSyncs) {
            if (e.key !== sync.key) continue;
            try {
                // prevent looping
                const parsed = JSON.parse(e.newValue);
                if (parsed !== sync.get()) sync.set(parsed);
            } catch {
                // malformed value in storage — ignore
            }
            break;
        }
    };
    window.addEventListener("storage", onStorageChange);
    onCleanup(() => window.removeEventListener("storage", onStorageChange));

    // persisted signals

    // theme
    const [theme, setTheme] = makePersisted(createSignal<ConfigColorMode>("system"), {name: KEYS.theme});
    const [midnightDark, setMidnightDark] = makePersisted(createSignal<boolean>(false), {name: KEYS.midnightDark});

    // sidebar
    const [showSidebarControls, setShowSidebarControls] = makePersisted(createSignal(true), {name: KEYS.sidebarShowControls});
    const [sidebarStartsCollapsed, setSidebarStartsCollapsed] = makePersisted( createSignal(false), {name: KEYS.sidebarStartsCollapsed});
    const [sidebarSort, setSidebarSort] = makePersisted(createSignal<SortMode>("tree"), {name: KEYS.sidebarSort});
    const [sidebarView, setSidebarView] = makePersisted(createSignal<ViewMode>("list"), {name: KEYS.sidebarView});
    const [sidebarFavoritesOnly, setSidebarFavoritesOnly] = makePersisted(createSignal<boolean>(false), {name: KEYS.sidebarFavoritesOnly});
    const [sidebarHiddenItems, setSidebarHiddenItems] = makePersisted(createSignal<string[]>([]), {name: KEYS.sidebarHiddenItems});
    const [sidebarCollapsedGroups, setSidebarCollapsedGroups] = makePersisted(createSignal<string[]>([]), {name: KEYS.sidebarCollapsedGroups});

    // tables
    const [tablePageSize, setTablePageSize] = makePersisted(createSignal<number>(10), {name: KEYS.tablePageSize});
    const [tableHiddenColumns, setTableHiddenColumns] = makePersisted(createSignal<Record<string, string[]>>({}), {name: KEYS.tableHiddenColumns});

    // game data?
    const [completedQuestsRaw, setCompletedQuestsRaw] = makePersisted(createSignal<number[]>([]), {name: KEYS.completedQuests});

    // easter eggs
    const [easterEggs, setEasterEggs] = makePersisted(createSignal<boolean>(false), {name: KEYS.easterEggs});
    const [tf2Mode, setTf2Mode] = makePersisted(createSignal<boolean>(false), {name: KEYS.tf2Mode});
    const [r9Mode, setR9Mode] = makePersisted(createSignal<boolean>(false), {name: KEYS.r9Mode});


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
        {key: KEYS.theme, get: theme, set: setTheme},
        {key: KEYS.midnightDark, get: midnightDark, set: setMidnightDark},
        {key: KEYS.sidebarShowControls, get: showSidebarControls, set: setShowSidebarControls},
        {key: KEYS.sidebarSort, get: sidebarSort, set: setSidebarSort},
        {key: KEYS.sidebarView, get: sidebarView, set: setSidebarView},
        {key: KEYS.sidebarFavoritesOnly, get: sidebarFavoritesOnly, set: setSidebarFavoritesOnly},
        {key: KEYS.sidebarHiddenItems, get: sidebarHiddenItems, set: setSidebarHiddenItems},
        {key: KEYS.tablePageSize, get: tablePageSize, set: setTablePageSize},
        {key: KEYS.completedQuests, get: completedQuestsRaw, set: setCompletedQuestsRaw},
        {key: KEYS.easterEggs, get: easterEggs, set: setEasterEggs},
        {key: KEYS.tf2Mode, get: tf2Mode, set: setTf2Mode},
        {key: KEYS.r9Mode, get: r9Mode, set: setR9Mode},
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
