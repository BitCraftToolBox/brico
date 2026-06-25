import {Accessor, createContext, createMemo, JSX, useContext} from "solid-js";
import {
    createGlobalSearchIndex,
    globalSearch as runGlobalSearch,
    type GlobalSearchIndex,
    type GroupedResults,
    type ObjectMatch,
    quickSearch as runQuickSearch,
} from "~/lib/global-search";

interface GlobalSearchContextValue {
    globalSearch: (query: string, maxPerTable?: number, scoreCutoff?: number) => GroupedResults;
    quickSearch: (query: string, maxResults?: number) => ObjectMatch[];
}

const GlobalSearchContext = createContext<GlobalSearchContextValue>();

export function GlobalSearchProvider(props: { children: JSX.Element; isReady: Accessor<boolean> }) {
    const index = createMemo<GlobalSearchIndex | null>(() => (
        props.isReady() ? createGlobalSearchIndex() : null
    ));

    const contextValue: GlobalSearchContextValue = {
        globalSearch: (query, maxPerTable = 10, scoreCutoff = 0.2) => (
            runGlobalSearch(index(), query, maxPerTable, scoreCutoff)
        ),
        quickSearch: (query, maxResults = 15) => runQuickSearch(index(), query, maxResults),
    };

    return (
        <GlobalSearchContext.Provider value={contextValue}>
            {props.children}
        </GlobalSearchContext.Provider>
    );
}

export function useGlobalSearch(): GlobalSearchContextValue {
    const ctx = useContext(GlobalSearchContext);
    if (!ctx) throw new Error("useGlobalSearch() must be used within a <GlobalSearchProvider>");
    return ctx;
}
