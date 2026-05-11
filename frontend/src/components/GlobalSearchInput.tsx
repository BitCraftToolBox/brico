/**
 * GlobalSearchInput — Search input with tabbed dropdown suggestions.
 *
 * Features:
 *   - Fuzzy search across all game tables via quickSearch()
 *   - Dropdown grouped into tabs: "All" (flat by score) + one per matching group
 *   - Keyboard navigation (↑/↓ to move items, ←/→ to switch tabs when item is selected, Enter, Escape)
 *   - "/" shortcut to focus
 *   - Click outside to close
 *   - Enter navigates to full /search page
 */

import {useNavigate} from "@solidjs/router";
import {TbOutlineSearch as IconSearch} from "solid-icons/tb";
import {createMemo, createSignal, For, onCleanup, onMount, Show} from "solid-js";
import {ObjectMatch, quickSearch} from "~/lib/global-search";
import {cn} from "~/lib/utils";

interface GlobalSearchInputProps {
    class?: string;
    placeholder?: string;
    autofocus?: boolean;
    large?: boolean;
}

interface TabDef {
    id: string;
    label: string;
    count: number;
}

export default function GlobalSearchInput(props: GlobalSearchInputProps) {
    const navigate = useNavigate();
    const [query, setQuery] = createSignal("");
    const [dropdownOpen, setDropdownOpen] = createSignal(false);
    const [activeIndex, setActiveIndex] = createSignal(-1);
    const [activeTab, setActiveTab] = createSignal("all");
    let inputRef: HTMLInputElement | undefined;
    let dropdownRef: HTMLDivElement | undefined;
    let wrapperRef: HTMLDivElement | undefined;
    // Map of tab id → button element for scroll-into-view
    const tabButtonRefs = new Map<string, HTMLButtonElement>();

    // All suggestions flat-sorted by score
    const allSuggestions = createMemo((): ObjectMatch[] => {
        const q = query().trim();
        if (!q) return [];
        return quickSearch(q);
    });

    // Group suggestions by table label
    const groupedSuggestions = createMemo((): Map<string, { label: string; matches: ObjectMatch[] }> => {
        const map = new Map<string, { label: string; matches: ObjectMatch[] }>();
        for (const match of allSuggestions()) {
            const existing = map.get(match.tableName);
            if (existing) {
                existing.matches.push(match);
            } else {
                map.set(match.tableName, {label: match.label, matches: [match]});
            }
        }
        return map;
    });

    const tabs = createMemo((): TabDef[] => {
        const result: TabDef[] = [{id: "all", label: "All", count: allSuggestions().length}];
        for (const [tableKey, group] of groupedSuggestions()) {
            result.push({id: tableKey, label: group.label, count: group.matches.length});
        }
        return result;
    });

    // Items visible in the current tab
    const visibleItems = createMemo((): ObjectMatch[] => {
        const tab = activeTab();
        if (tab === "all") return allSuggestions();
        return groupedSuggestions().get(tab)?.matches ?? [];
    });

    const hasSuggestions = () => dropdownOpen() && allSuggestions().length > 0;

    // When suggestions change, reset to "all" tab and clear active index
    createMemo(() => {
        allSuggestions(); // track
        setActiveTab("all");
        setActiveIndex(-1);
    });

    const switchTab = (tabId: string, keepHighlight = false) => {
        setActiveTab(tabId);
        setActiveIndex(keepHighlight ? 0 : -1);
        // Scroll the tab button into view
        tabButtonRefs.get(tabId)?.scrollIntoView({block: "nearest", inline: "nearest"});
    };

    const commitSuggestion = (match: ObjectMatch) => {
        setQuery("");
        setDropdownOpen(false);
        setActiveIndex(-1);
        if (inputRef) inputRef.value = "";
        navigate(match.route);
    };

    const handleInput = (e: InputEvent) => {
        const val = (e.currentTarget as HTMLInputElement).value;
        setQuery(val);
        setDropdownOpen(true);
        setActiveIndex(-1);
    };

    const handleSearch = (e: Event) => {
        e.preventDefault();
        const q = query().trim();
        setDropdownOpen(false);
        if (inputRef) inputRef.value = "";
        setQuery("");
        navigate(`/search?q=${encodeURIComponent(q)}`);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            setDropdownOpen(false);
            setActiveIndex(-1);
            if (query() === "") inputRef?.blur();
            return;
        }

        if (!hasSuggestions()) return;

        const items = visibleItems();
        const tabList = tabs();

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
        } else if (e.key === "ArrowLeft" && activeIndex() > -1) {
            e.preventDefault();
            const currentTabIdx = tabList.findIndex(t => t.id === activeTab());
            const prevIdx = Math.max(0, currentTabIdx - 1);
            switchTab(tabList[prevIdx].id, true);
        } else if (e.key === "ArrowRight" && activeIndex() > -1) {
            e.preventDefault();
            const currentTabIdx = tabList.findIndex(t => t.id === activeTab());
            const nextIdx = Math.min(tabList.length - 1, currentTabIdx + 1);
            switchTab(tabList[nextIdx].id, true);
        } else if (e.key === "Enter" && activeIndex() >= 0) {
            e.preventDefault();
            const item = items[activeIndex()];
            if (item) commitSuggestion(item);
        }
    };

    onMount(() => {
        if (props.autofocus) inputRef?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "/") return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            inputRef?.focus();
            inputRef?.select();
        };

        const onPointerDown = (e: PointerEvent) => {
            if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
                setDropdownOpen(false);
                setActiveIndex(-1);
            }
        };

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        onCleanup(() => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        });
    });

    const isLarge = () => props.large;

    return (
        <div ref={wrapperRef} class={cn("relative", props.class)}>
            <form onSubmit={handleSearch} role="search">
                <div class="relative">
                    <IconSearch class={cn(
                        "absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none",
                        isLarge() ? "size-5" : "size-4"
                    )}/>
                    <input
                        ref={inputRef}
                        type="search"
                        placeholder={props.placeholder ?? "Search..."}
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            if (query().trim()) setDropdownOpen(true);
                        }}
                        class={cn(
                            "w-full rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-ring",
                            isLarge() ? "pl-10 pr-12 py-3 text-base" : "pl-8 pr-8 py-1.5 text-sm"
                        )}
                        aria-label="Global search"
                        aria-autocomplete="list"
                        aria-expanded={hasSuggestions()}
                        autocomplete="off"
                    />
                    <kbd class={cn(
                        "absolute top-1/2 -translate-y-1/2 text-xs text-muted-foreground hidden sm:inline",
                        isLarge() ? "right-4" : "right-2"
                    )}>/</kbd>
                </div>
            </form>

            <Show when={hasSuggestions()}>
                <div
                    ref={dropdownRef}
                    class="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg z-50 min-w-64 flex flex-col"
                >
                    {/* Tab bar */}
                    <Show when={tabs().length > 2}>
                        <div class="flex gap-0.5 px-2 pt-1.5 pb-0 overflow-x-auto scrollbar-none border-b border-border">
                            <For each={tabs()}>
                                {(tab) => (
                                    <button
                                        ref={(el) => tabButtonRefs.set(tab.id, el)}
                                        type="button"
                                        class={cn(
                                            "shrink-0 px-2.5 py-1 text-xs rounded-t-sm transition-colors whitespace-nowrap",
                                            activeTab() === tab.id
                                                ? "bg-background text-foreground font-medium border-b-2 border-primary"
                                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                        )}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            switchTab(tab.id, false);
                                        }}
                                    >
                                        {tab.label}
                                        <span class="ml-1 opacity-60">{tab.count}</span>
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>

                    {/* Items list */}
                    <ul class="py-1 max-h-80 overflow-y-auto" role="listbox">
                        <For each={visibleItems()}>
                            {(match, i) => {
                                const isActive = () => activeIndex() === i();
                                return (
                                    <li
                                        role="option"
                                        aria-selected={isActive()}
                                        class={cn(
                                            "px-3 py-1.5 text-sm cursor-pointer transition-colors flex flex-col gap-0.5",
                                            isActive() ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                                        )}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            commitSuggestion(match);
                                        }}
                                        onMouseEnter={() => setActiveIndex(i())}
                                    >
                                        <Show when={activeTab() === "all"}>
                                            <span class="text-xs text-muted-foreground">{match.label}</span>
                                        </Show>
                                        <span class="font-medium truncate">
                                            {match.displayName}
                                            <Show when={match.matchField !== "name" && match.matchField !== "id"}>
                                                <span class="text-xs text-muted-foreground ml-2">
                                                    ({match.matchField}: {match.matchValue.length > 50 ? match.matchValue.slice(0, 50) + "…" : match.matchValue})
                                                </span>
                                            </Show>
                                        </span>
                                    </li>
                                );
                            }}
                        </For>
                    </ul>

                    {/* Footer */}
                    <div class="px-3 py-1 text-xs text-muted-foreground border-t border-border flex justify-between items-center">
                        <span>Enter for full results · ←→ switch tabs</span>
                    </div>
                </div>
            </Show>
        </div>
    );
}
