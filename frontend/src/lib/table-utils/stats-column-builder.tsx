/**
 * Stats Column & Cell Builders
 *
 * Utilities for rendering CsvStatEntry arrays in table cells and tooltips.
 * Includes multi-stat filtering support.
 */

import {CellContext, Column, ColumnDef, FilterFn, Row} from "@tanstack/solid-table";
import {For, JSX} from "solid-js";
import {CsvStatEntry} from "~/bindings/src/csv_stat_entry_type";
import {FilterSetupProps} from "~/components/data-table/data-table";
import {StatsBasedOption, StatsFilterValue, StatsOptionEntry} from "~/components/data-table/table-faceted-filter";

import {AccessorFunction, AccessorProp, resolveAccessor} from "~/lib/table-utils/base";
import {fixFloat, splitCamelCase} from "~/lib/utils";
import CharacterStatType from "../../bindings/src/character_stat_type_type";

// ─── Formatting helpers ─────────────────────────────────────────

export function formatStatValue(stat: CsvStatEntry): string {
    const val = fixFloat(stat.value * (stat.isPct ? 100 : 1));
    return stat.isPct ? `${val}%` : String(val);
}

export function formatStatLabel(stat: CsvStatEntry): string {
    return splitCamelCase(stat.id?.tag ?? "");
}

// ─── Stats Pill ─────────────────────────────────────────────────

/** Renders a single stat as a compact badge with tooltip */
export function StatPill(props: { stat: CsvStatEntry }): JSX.Element {
    const label = () => formatStatLabel(props.stat);
    const value = () => formatStatValue(props.stat);
    return (
        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground whitespace-nowrap">
            <span class="font-medium">{label()}</span>
            <span class="opacity-70">{value()}</span>
        </span>
    );
}

/** Renders a list of stats as compact pills, wrapping as needed */
export function StatPillList(props: { stats: CsvStatEntry[] }): JSX.Element {
    return (
        <div class="flex flex-wrap gap-1">
            <For each={props.stats}>
                {stat => <StatPill stat={stat}/>}
            </For>
        </div>
    );
}

// ─── Extraction helper ─────────────────────────────────────────────

export function consolidateStats(stats: CsvStatEntry[]): CsvStatEntry[] {
    const statTotals = stats.reduce(
        (totals, stat) => {
            const existing = totals.get(stat.id.tag);
            const absVal = stat.isPct ? 0 : stat.value;
            const pctVal = stat.isPct ? stat.value : 0;
            if (!existing) {
                totals.set(stat.id.tag, [absVal, pctVal]);
            } else {
                totals.set(stat.id.tag, [(existing[0] ?? 0) + absVal, (existing[1] ?? 0) + pctVal]);
            }
            return totals;
        },
        new Map<CharacterStatType["tag"], [number | null, number | null]>()
    );
    const totalArray: CsvStatEntry[] = [];
    for (let entry of statTotals.entries()) {
        const stat = {tag: entry[0]} as CharacterStatType;
        const absVal = entry[1][0];
        const pctVal = entry[1][1];
        if (absVal) totalArray.push({id: stat, value: absVal, isPct: false});
        if (pctVal) totalArray.push({id: stat, value: pctVal, isPct: true});
    }
    return totalArray;
}

// ─── Stats Filter ───────────────────────────────────────────────

function makeStatKey(tag: string, isPct: boolean): string {
    return `${tag}_${isPct ? 'pct' : 'abs'}`;
}

function reverseStatKey(key: string): [string, boolean] {
    const lastUnderscore = key.lastIndexOf('_');
    const statTag = key.substring(0, lastUnderscore);
    const isPct = key.substring(lastUnderscore + 1) === 'pct';
    return [statTag, isPct];
}

/**
 * Custom filter function for CsvStatEntry[] columns.
 * Filter value is a Record<statKey, [min, max]>.
 * A row passes if it has ALL specified stats within their ranges.
 */
export function statsFilterFn<T>(): FilterFn<T> {
    const fn = (
        row: Row<T>,
        columnId: string,
        filterValue: StatsFilterValue
    ): boolean => {
        if (!filterValue || !Object.keys(filterValue.stats).length) return true;
        const stats = row.getValue(columnId) as CsvStatEntry[] | undefined;
        if (!stats?.length) return false;

        const requireAll = filterValue.requireAll;
        let matchedAllSoFar = false;
        for (const [key, [min, max]] of Object.entries(filterValue.stats)) {
            const [statTag, isPct] = reverseStatKey(key);
            const stat = stats.find(s => s.id.tag === statTag && s.isPct === isPct);
            if (!stat) {
                if (requireAll) return false;
                continue;
            }
            const val = fixFloat(stat.value * (isPct ? 100 : 1));
            if (val < min || val > max) {
                if (requireAll) return false;
                continue;
            }
            // one match is enough
            if (!requireAll) return true;
            matchedAllSoFar = true;
        }
        return matchedAllSoFar;
    };
    fn.autoRemove = (val: any) => !val || Object.keys(val).length === 0;
    return fn;
}

/**
 * Computes available stat types and their value ranges from the column data.
 * Used by statsFilter to provide stat options.
 *
 * IMPORTANT: This must be called inside a SolidJS reactive context (e.g. createMemo).
 * We intentionally call the column's accessorFn directly instead of row.getValue(),
 * so that any reactive signal reads inside the accessor (e.g. BitCraftTables indices)
 * are tracked. This ensures the memo re-runs when secondary tables finish loading.
 */
function computeStatOptions<T>(col: Column<T>, columnId: string): StatsOptionEntry[] {
    const statRanges = new Map<string, { label: string; isPct: boolean; min: number; max: number }>();

    // Prefer calling the raw accessor function so reactive dependencies (e.g.
    // BitCraftTables.EquipmentDesc indices) are tracked by the enclosing createMemo.
    // row.getValue() caches the result outside any reactive context, so secondary-table
    // loads would never trigger a re-computation.
    const accessorFn = (col.columnDef as any).accessorFn as
        ((row: T, idx: number) => CsvStatEntry[] | undefined) | undefined;

    const rows = col.getFacetedRowModel().rows;
    for (const row of rows) {
        const stats: CsvStatEntry[] | undefined = accessorFn
            ? accessorFn(row.original, row.index)
            : (row.getValue(columnId) as CsvStatEntry[] | undefined);
        if (!stats?.length) continue;
        for (const stat of stats) {
            const key = makeStatKey(stat.id.tag, stat.isPct);
            const val = fixFloat(stat.value * (stat.isPct ? 100 : 1));
            const existing = statRanges.get(key);
            if (existing) {
                existing.min = Math.min(existing.min, val);
                existing.max = Math.max(existing.max, val);
            } else {
                statRanges.set(key, {
                    label: splitCamelCase(stat.id.tag) + (stat.isPct ? ' %' : ''),
                    isPct: stat.isPct,
                    min: val,
                    max: val,
                });
            }
        }
    }

    return Array.from(statRanges.entries())
        .map(([key, v]) => ({
            key,
            label: v.label,
            isPct: v.isPct,
            minMax: [v.min, v.max] as [number, number],
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Creates a stats faceted filter for CsvStatEntry[] columns.
 * Supports multi-stat filtering with per-stat ranges.
 */
export function statsFilter<T>(column: string = "Stats"): FilterSetupProps<T, StatsBasedOption> {
    return {
        column,
        title: column,
        type: "stat",
        options: (col: Column<T> | undefined) => {
            if (!col) return {label: column, stats: []};
            return {
                label: column,
                stats: computeStatOptions(col, column),
            };
        },
    };
}

// ─── Column builder ─────────────────────────────────────────────

function statsOrUndefined(row: { stats: CsvStatEntry[] }): CsvStatEntry[] | undefined {
    return row.stats?.length ? row.stats : undefined;
}

/**
 * Creates a "Stats" column that renders CsvStatEntry[] as labeled pills.
 *
 * @param id - optional column id override (default: "Stats")
 * @param accessor - optional function or key to get the stat array from the row
 *                   the default function requires a `stats` property on the row
 */
export function statsColumn<T>(
    id: string = "Stats",
    accessor: AccessorProp<T, CsvStatEntry[] | undefined> = {accessorFn: statsOrUndefined as AccessorFunction<T, CsvStatEntry[] | undefined>},
): ColumnDef<T, CsvStatEntry[]> {
    return {
        id,
        ...accessor,
        cell: (props: CellContext<T, CsvStatEntry[]>): JSX.Element => {
            const stats = props.getValue();
            if (!stats?.length) return undefined;
            return <StatPillList stats={stats}/>;
        },
        filterFn: statsFilterFn<T>(),
        sortingFn: (rowA, rowB) => {
            const a = (rowA.getValue(id) as CsvStatEntry[]);
            const b = (rowB.getValue(id) as CsvStatEntry[]);
            if (!!a && !!b) {
                return a.reduce((t, c) => t + c.value, 0)
                    - b.reduce((t, c) => t + c.value, 0);
            }
            return a ? -1 : b ? 1 : 0;
        },
        getUniqueValues: (obj: T) => {
            const stats = resolveAccessor(accessor, obj, []);
            return stats.map(cse => makeStatKey(cse.id.tag, cse.isPct)) || [];
        },
        sortUndefined: "last"
    };
}


