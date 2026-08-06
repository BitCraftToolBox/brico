import {ColumnDef, DeepKeys, DeepValue, RowData} from "@tanstack/solid-table";
import {FilterSetupProps} from "~/components/data-table/data-table";
import {Label} from "~/lib/labels";

// Column headers otherwise have no display text distinct from the (load-bearing, English) column
// id — see the "Column labels" note in I18N_PLAN.md. Declared against `@tanstack/table-core`
// because that's where `ColumnMeta` actually lives; `@tanstack/solid-table` only re-exports it.
declare module "@tanstack/table-core" {
    interface ColumnMeta<TData extends RowData, TValue> {
        label?: Label | string;
    }
}

export type BitCraftToDataDef<T> = {
    columns: ColumnDef<T, any>[];
    facetedFilters?: FilterSetupProps<T, any>[];
    searchColumns?: string[];
};

export type AccessorKey<T, V = any> = {
    [K in DeepKeys<T>]: DeepValue<T, K> extends V ? K : never
}[DeepKeys<T>]
export type AccessorFunction<T, V> = (row: T) => V;
export type AccessorProp<T, V> = { accessorKey: AccessorKey<T, V> } | { accessorFn: AccessorFunction<T, V> };

export function resolveAccessor<T, V>(acc: AccessorProp<T, V>, obj: T): V | undefined;
export function resolveAccessor<T, V>(acc: AccessorProp<T, V>, obj: T, def: NonNullable<V>): NonNullable<V>;

export function resolveAccessor<T, V>(acc: AccessorProp<T, V>, obj: T, def?: V): V | undefined {
    let ret;
    if ('accessorFn' in acc) {
        ret = acc.accessorFn(obj);
    } else {
        const aKey = acc.accessorKey as string;
        if (aKey.includes(".")) {
            // Walk the dotted path from `obj` — starting from `undefined` (as this used to) made
            // every nested key resolve to undefined.
            let result: any = obj;
            for (const key of aKey.split(".")) {
                result = result?.[key];
            }
            ret = result;
        } else {
            ret = (obj as any)[aKey];
        }
    }
    return ret ?? def;
}