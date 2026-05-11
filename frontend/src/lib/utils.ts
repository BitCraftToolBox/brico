import {FilterFn, Row, Table} from "@tanstack/solid-table";
import {type ClassValue, clsx} from "clsx"
import {twMerge} from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}


function testFalsey(val: any) {
    return val === undefined || val === null || val === ''
}

export function includedIn<T>(): FilterFn<T> {
    const fn = (
        row: Row<T>,
        columnId: string,
        filterValue: T[]
    ) => {
        return filterValue.includes(row.getValue(columnId));
    }
    fn.autoRemove = (val: T) => testFalsey(val);
    return fn;
}

export function compareBasic(a: number, b: number) {
    return a === b ? 0 : a > b ? 1 : -1
}

export function compareOptions(a: { label: string, value: any }, b: { label: string, value: any }) {
    const aVal = a.value;
    const bVal = b.value;
    if (aVal === bVal) return 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') return compareBasic(aVal, bVal);
    if (aVal == null || bVal == null) return (
        aVal == null ? 1 : -1
    )
    if (typeof aVal === 'undefined' || typeof bVal === 'undefined') return (
        typeof aVal === 'undefined' ? 1 : -1
    )
    return aVal.toString().localeCompare(bVal.toString());
}

export function fixFloat(f: number, p?: number): number;
export function fixFloat(f: number | undefined, p?: number): number | undefined;

export function fixFloat(f: number | undefined, places: number = 3): number | undefined {
    if (typeof f === 'undefined') return undefined;
    return +f.toPrecision(places);
}

export function splitCamelCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function ensurePagesVisible(table: Table<any>) {
    if (table.getState().pagination.pageIndex >= table.getPageCount()) {
        table.setPageIndex(table.getPageCount() - 1);
    }
}

export function undefinedIfZero(val: number | undefined) {
    if (val === undefined) return undefined;
    return val !== 0 ? val : undefined;
}

export function readableSeconds(seconds: number | undefined): string | undefined {
    if (seconds === undefined) return undefined;
    seconds = Math.round(seconds);
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60;
    return [
        hours > 0 ? `${hours}h` : null,
        minutes > 0 ? `${minutes}m` : null,
        secs > 0 ? `${secs}s` : null,
    ].filter(Boolean).join(" ") || "0s";
}