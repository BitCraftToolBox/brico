import {throttle} from "@solid-primitives/scheduled"
import type {Table} from "@tanstack/solid-table"

import {TbOutlineX as IconX} from "solid-icons/tb"
import {createSignal, For, onCleanup, Show} from "solid-js";
import {Button} from "~/components/ui/button"
import {TextField, TextFieldInput} from "~/components/ui/text-field"
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {ensurePagesVisible} from "~/lib/utils";

import {TableFacetedFilter, TableFacetedFilterProps} from "./table-faceted-filter"
import {TableViewOptions} from "./table-view-options"

type DataTableToolbarProps<TData> = {
    table: Table<TData>
    filters?: TableFacetedFilterProps<TData>[]
    searchColumns?: string[]
}

export function TableToolbar<TData>(props: DataTableToolbarProps<TData>) {
    const isFiltered = () => props.table.getState().columnFilters.length > 0 || props.table.getState().globalFilter;

    const getSearchPlaceholder = () => {
        if (!props.searchColumns || props.searchColumns.length === 0) {
            return "Search...";
        }
        if (props.searchColumns.length === 1) {
            return `Search by ${props.searchColumns[0]}...`;
        }
        const lastCol = props.searchColumns[props.searchColumns.length - 1];
        const otherCols = props.searchColumns.slice(0, -1).join(", ");
        return `Search by ${otherCols}${props.searchColumns.length > 2 ? ',' : ''} or ${lastCol}...`;
    };

    const [currentSearch, setCurrentSearch] = createSignal<string>("");
    const [isSmartFiltering, setIsSmartFiltering] = createSignal(false);

    // Leading throttled global filter setter (fires immediately, then throttles to 300ms)
    const throttledSetGlobalFilter = throttle((value: string) => {
        props.table.setGlobalFilter(value);
        ensurePagesVisible(props.table);
    }, 300);

    onCleanup(() => {
        throttledSetGlobalFilter.clear();
    });

    const resetAllFilters = () => {
        setCurrentSearch("");
        setIsSmartFiltering(false);
        throttledSetGlobalFilter.clear();
        props.table.setGlobalFilter("");
        props.table.resetColumnFilters();
        ensurePagesVisible(props.table);
    }

    /**
     * Attempts to apply tier and tag/type smart filters from the given value.
     * Returns true if any filter was applied.
     */
    function tryApplySmartFilters(value: string): boolean {
        const tierTagMatch = value.match(/^t(-?\d{1,2}|[*?])\s*(.*)/i);
        if (!tierTagMatch) return false;

        const wildTier = tierTagMatch[1] === '*' || tierTagMatch[1] === '?';
        let tierNum;
        if (!wildTier) {
            tierNum = parseInt(tierTagMatch[1], 10);
            if (tierNum < -1 || tierNum > 10) return false;
        }
        const remainder = tierTagMatch[2].trim();

        let appliedAny = false;

        // Try to set Tier filter
        const tierCol = props.table.getColumn("Tier");
        if (tierCol) {
            if (!wildTier) {
                tierCol.setFilterValue([tierNum]);
            }
            appliedAny = true;
        }

        // Try to match remainder against Tag or Type column options
        if (remainder) {
            const tagColName = ["Tag", "Type"].find(name => props.table.getColumn(name));
            if (tagColName) {
                const tagCol = props.table.getColumn(tagColName)!;
                const uniqueValues = tagCol.getFacetedUniqueValues();
                const lowerRemainder = remainder.toLowerCase();

                // Prefer exact match first, then fall back to partial
                let matched: any = undefined;
                for (const key of uniqueValues.keys()) {
                    if (String(key).toLowerCase() === lowerRemainder) {
                        matched = key;
                        break;
                    }
                }
                if (matched === undefined) {
                    for (const key of uniqueValues.keys()) {
                        if (String(key).toLowerCase().includes(lowerRemainder)) {
                            matched = key;
                            break;
                        }
                    }
                }

                if (matched !== undefined) {
                    tagCol.setFilterValue([matched]);
                    appliedAny = true;
                }
            }
        } else {
            const tagColName = ["Tag", "Type"].find(name => props.table.getColumn(name));
            if (tagColName) {
                const tagCol = props.table.getColumn(tagColName)!;
                tagCol.setFilterValue(undefined);
            }
        }

        return appliedAny;
    }

    function setFilter(value: string) {
        if (!value) {
            setCurrentSearch("");
            setIsSmartFiltering(false);
            props.table.setGlobalFilter("");
            return;
        }

        // While typing: apply smart filters live but keep the search text so the
        // user can continue refining. Only clear on Enter (see handleKeyDown).
        if (tryApplySmartFilters(value)) {
            setCurrentSearch(value);
            setIsSmartFiltering(true);
            props.table.setGlobalFilter("");
            throttledSetGlobalFilter.clear();
            ensurePagesVisible(props.table);
            return;
        }

        setCurrentSearch(value);
        throttledSetGlobalFilter(value);
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (currentSearch()) {
                setCurrentSearch("");
                setIsSmartFiltering(false);
                throttledSetGlobalFilter.clear();
                props.table.setGlobalFilter("");
                return;
            } else if (isFiltered()) {
                resetAllFilters();
                return;
            } else {
                if (e.target instanceof HTMLInputElement) {
                    e.target.blur();
                }
            }
        }
        if (e.key !== "Enter") return;
        const value = currentSearch() ?? "";
        if (tryApplySmartFilters(value)) {
            // Finalize: clear the search bar now that the user confirmed
            setCurrentSearch("");
            setIsSmartFiltering(false);
            throttledSetGlobalFilter.clear();
            props.table.setGlobalFilter("");
        } else if (value) {
            // For normal searches, apply immediately
            throttledSetGlobalFilter(value);
        }
    }

    return (
        <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
                <div class="flex space-x-2">
                    <Show when={props.searchColumns?.length}>
                        <Tooltip open={isSmartFiltering()} placement="top-start">
                            <TooltipTrigger as={TextField}
                                            value={currentSearch()}
                                            onChange={setFilter}
                                            class="w-auto lg:w-[250px]"
                            >
                                <TextFieldInput placeholder={getSearchPlaceholder()} class="h-8"
                                                onKeyDown={handleKeyDown}/>
                            </TooltipTrigger>
                            <TooltipContent>
                                Press <kbd>Enter</kbd> to commit Tier/Tag filters, <kbd>Esc</kbd> to clear.
                            </TooltipContent>
                        </Tooltip>
                    </Show>
                    {isFiltered() && (
                        <Button
                            variant="outline"
                            onClick={resetAllFilters}
                            class="h-8 w-auto px-2 sm:px-3"
                        >
                            Reset
                            <IconX/>
                        </Button>
                    )}
                </div>
                <TableViewOptions table={props.table}/>
            </div>
            <div class="grid grid-cols-3 sm:flex flex-wrap items-center gap-2 w-full">
                <For each={props.filters}>
                    {(filter) => <TableFacetedFilter {...filter} />}
                </For>
            </div>
        </div>
    );
}