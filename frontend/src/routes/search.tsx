/**
 * /search — Full search results page.
 *
 * Reads query from URL ?q= parameter.
 * Results are shown in tabs:
 *   - "All Results" tab: every match sorted by score
 *   - One tab per matching group, sorted by best score
 */

import {A, useLocation} from "@solidjs/router";
import {TbOutlineSearch as IconSearch} from "solid-icons/tb";
import {createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "~/components/ui/tabs";
import {type GroupedResults, type ObjectMatch} from "~/lib/global-search";
import {useGlobalSearch} from "~/lib/global-search-context";

export default function SearchPage() {
    const location = useLocation();
    const {globalSearch} = useGlobalSearch();
    const initQ = new URLSearchParams(location.search).get("q") ?? "";
    const [query, setQuery] = createSignal(initQ);
    let searchInputRef: HTMLInputElement | undefined;

    onMount(() => {
        if (searchInputRef && initQ) searchInputRef.value = initQ;
        searchInputRef?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "/") return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            searchInputRef?.focus();
            searchInputRef?.select();
        };
        document.addEventListener("keydown", onKeyDown);
        onCleanup(() => document.removeEventListener("keydown", onKeyDown));
    });

    createEffect(on(() => location.search, (search) => {
        const q = new URLSearchParams(search).get("q") ?? "";
        if (q !== query()) {
            setQuery(q);
            if (searchInputRef) searchInputRef.value = q;
        }
    }, {defer: true}));

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const handleInput = (val: string) => {
        setQuery(val);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const url = new URL(window.location.href);
            if (val) url.searchParams.set("q", val);
            else url.searchParams.delete("q");
            history.replaceState(history.state, "", url.toString());
        }, 300);
    };

    const results = createMemo((): GroupedResults | null => {
        const q = query().trim();
        if (!q) return null;
        return globalSearch(q, 50);
    });

    // Flat list of all matches sorted by score (for "All" tab)
    const allMatches = createMemo((): ObjectMatch[] => {
        const r = results();
        if (!r) return [];
        const flat: ObjectMatch[] = [];
        for (const group of r.groups.values()) flat.push(...group.matches);
        flat.sort((a, b) => a.score - b.score);
        return flat;
    });

    // Groups sorted by their best match score
    const sortedGroups = createMemo(() => {
        const r = results();
        if (!r) return [];
        return [...r.groups.entries()];
    });

    const MatchRow = (match: ObjectMatch, showLabel = false) => (
        <A
            href={match.route}
            class="flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-colors text-sm"
        >
            <Show when={showLabel}>
                <span class="shrink-0 text-xs text-muted-foreground w-20 truncate">{match.label}</span>
            </Show>
            <span class="font-medium min-w-0 truncate flex-1">{match.displayName}</span>
            <Show when={match.matchField !== "name" && match.matchField !== "id"}>
                <span class="shrink-0 text-xs text-muted-foreground max-w-[35%] truncate">
                    {match.matchField}: {match.matchValue}
                </span>
            </Show>
        </A>
    );

    return (
        <MainLayout title="Search" hideSearch={true}>
            <div class="max-w-3xl mx-auto space-y-4">
                {/* Search bar */}
                <form onSubmit={(e) => e.preventDefault()}>
                    <div class="relative">
                        <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none"/>
                        <input
                            ref={searchInputRef}
                            type="search"
                            placeholder="Search items, buildings, creatures, recipes..."
                            onInput={(e) => handleInput(e.currentTarget.value)}
                            class="w-full pl-10 pr-12 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
                            aria-label="Search"
                        />
                        <kbd class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hidden sm:inline">/</kbd>
                    </div>
                </form>

                {/* Results */}
                <Show when={query().trim()}>
                    <Show
                        when={results() && results()!.totalMatches > 0}
                        fallback={
                            <Show when={results()}>
                                <p class="text-sm text-muted-foreground text-center py-8">
                                    No results found for "{query().trim()}"
                                </p>
                            </Show>
                        }
                    >
                        <div class="text-sm text-muted-foreground">
                            {results()!.totalMatches} result{results()!.totalMatches !== 1 ? "s" : ""}
                        </div>

                        <Tabs defaultValue="all">
                            <TabsList class="h-auto flex-wrap gap-1 justify-start bg-transparent p-0 border-b border-border rounded-none pb-1 w-full">
                                <TabsTrigger
                                    value="all"
                                    class="data-[selected]:border-b-2 data-[selected]:border-primary rounded-none data-[selected]:bg-transparent data-[selected]:shadow-none"
                                >
                                    All
                                    <span class="ml-1 text-xs opacity-60">{allMatches().length}</span>
                                </TabsTrigger>
                                <For each={sortedGroups()}>
                                    {([tableKey, group]) => (
                                        <TabsTrigger
                                            value={tableKey}
                                            class="data-[selected]:border-b-2 data-[selected]:border-primary rounded-none data-[selected]:bg-transparent data-[selected]:shadow-none"
                                        >
                                            {group.label}
                                            <span class="ml-1 text-xs opacity-60">{group.total}</span>
                                        </TabsTrigger>
                                    )}
                                </For>
                            </TabsList>

                            {/* All Results tab */}
                            <TabsContent value="all" class="mt-3 space-y-1">
                                <For each={allMatches()}>
                                    {(match) => MatchRow(match, true)}
                                </For>
                            </TabsContent>

                            {/* Per-group tabs */}
                            <For each={sortedGroups()}>
                                {([tableKey, group]) => (
                                    <TabsContent value={tableKey} class="mt-3 space-y-1">
                                        <For each={group.matches}>
                                            {(match) => MatchRow(match, false)}
                                        </For>
                                        <Show when={group.total > group.matches.length}>
                                            <div class="text-xs text-muted-foreground pl-3 py-1">
                                                +{group.total - group.matches.length} more results (refine your query)
                                            </div>
                                        </Show>
                                    </TabsContent>
                                )}
                            </For>
                        </Tabs>
                    </Show>
                </Show>
            </div>
        </MainLayout>
    );
}
