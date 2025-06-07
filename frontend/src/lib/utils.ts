import {type ClassValue, clsx} from "clsx"
import {twMerge} from "tailwind-merge"
import {FilterFn, Row, Table} from "@tanstack/solid-table";

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
        filterValue: any[]
    ) => {
        return filterValue.includes(row.getValue(columnId));
    }
    fn.autoRemove = (val: any) => testFalsey(val);
    return fn;
}

export function compareBasic(a: number, b: number) {
    return a === b ? 0 : a > b ? 1 : -1
}

export function fixFloat(f: number, places: number = 3) {
    return +f.toFixed(places);
}

export function splitCamelCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function ensurePagesVisible(table: Table<any>) {
    if (table.getState().pagination.pageIndex >= table.getPageCount()) {
        table.setPageIndex(table.getPageCount() - 1);
    }
}

// https://stackoverflow.com/a/49725198 idk what this monstrosity is, but it works for my purposes
export type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>>
    & {
    [K in Keys]-?:
    Required<Pick<T, K>>
    & Partial<Record<Exclude<Keys, K>, undefined>>
}[Keys]