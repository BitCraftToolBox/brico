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
    sidebarShowControls: "brico:sidebar:show-controls",
    sidebarStartsCollapsed: "brico:sidebar:starts-collapsed",
    sidebarSort: "brico:sidebar:sort",
    sidebarView: "brico:sidebar:view",
    sidebarFavoritesOnly: "brico:sidebar:favorites-only",
    sidebarHiddenItems: "brico:sidebar:hidden-items",
    tablePageSize: "brico:table:page-size",
    tableHiddenColumns: "brico:table:hidden-columns",
    completedQuests: "brico:quests:completed",
    easterEggs: "brico:easter-eggs",
    tf2Mode: "brico:easter-eggs:tf2-mode",
    r9Mode: "brico:easter-eggs:r9-mode",
} as const;

function createSettings(): AppSettings {
    const [theme, setTheme] = makePersisted(
        createSignal<ConfigColorMode>("system"),
        {name: KEYS.theme}
    );

    const [showSidebarControls, setShowSidebarControls] = makePersisted(
        createSignal(true),
        {name: KEYS.sidebarShowControls}
    )
    const [sidebarStartsCollapsed, setSidebarStartsCollapsed] = makePersisted(
        createSignal(false),
        {name: KEYS.sidebarStartsCollapsed}
    );
    const [sidebarSort, setSidebarSort] = makePersisted(
        createSignal<SortMode>("tree"),
        {name: KEYS.sidebarSort}
    );
    const [sidebarView, setSidebarView] = makePersisted(
        createSignal<ViewMode>("list"),
        {name: KEYS.sidebarView}
    );
    const [sidebarFavoritesOnly, setSidebarFavoritesOnly] = makePersisted(
        createSignal<boolean>(false),
        {name: KEYS.sidebarFavoritesOnly}
    );
    const [sidebarHiddenItems, setSidebarHiddenItems] = makePersisted(
        createSignal<string[]>([]),
        {name: KEYS.sidebarHiddenItems}
    );
    /** Derived: all known hrefs minus explicitly hidden ones. */
    const sidebarFavorites = createMemo(() =>
        ALL_SIDEBAR_HREFS.filter(h => !sidebarHiddenItems().includes(h))
    );
    /** Setting favorites computes hidden = allHrefs - newFavorites. */
    const setSidebarFavorites = (favorites: string[]) => {
        setSidebarHiddenItems(ALL_SIDEBAR_HREFS.filter(h => !favorites.includes(h)));
    };

    const [tablePageSize, setTablePageSize] = makePersisted(
        createSignal<number>(10),
        {name: KEYS.tablePageSize}
    );
    const [tableHiddenColumns, setTableHiddenColumns] = makePersisted(
        createSignal<Record<string, string[]>>({}),
        {name: KEYS.tableHiddenColumns}
    );

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

    // Keep theme() in sync when another tab writes to "brico:theme".
    // makePersisted JSON-serializes values, so the raw localStorage value is e.g. `'"dark"'`.
    // We must JSON.parse before comparing/setting to avoid a double-encode feedback loop
    // that would exhaust the localStorage quota.
    const onStorageChange = (e: StorageEvent) => {
        if (e.key !== KEYS.theme || !e.newValue) return;
        try {
            const parsed = JSON.parse(e.newValue) as ConfigColorMode;
            if (parsed !== theme()) setTheme(parsed);
        } catch {
            // Malformed value in storage — ignore.
        }
    };
    window.addEventListener("storage", onStorageChange);
    onCleanup(() => window.removeEventListener("storage", onStorageChange));

    const [displayProbabilityAsAverage, setDisplayProbabilityAsAverage] = createSignal(false);
    const [flattenItemListOutputs, setFlattenItemListOutputs] = createSignal(false);

    // Session-only table state — keyed by table name, not persisted.
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

    const [completedQuestsRaw, setCompletedQuestsRaw] = makePersisted(
        createSignal<number[]>([]),
        {name: KEYS.completedQuests}
    );
    const completedQuests = createMemo(() => new Set(completedQuestsRaw()));
    const setCompletedQuests = (ids: number[]) => setCompletedQuestsRaw(ids);

    const [easterEggs, setEasterEggs] = makePersisted(createSignal<boolean>(false), {name: KEYS.easterEggs});
    const [tf2Mode, setTf2Mode] = makePersisted(createSignal<boolean>(false), {name: KEYS.tf2Mode});
    const [r9Mode, setR9Mode] = makePersisted(createSignal<boolean>(false), {name: KEYS.r9Mode});

    return {
        colorStorageManager,
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
