import {ColumnDef, DeepKeys, DeepValue} from "@tanstack/solid-table";
import {FilterSetupProps} from "~/components/data-table/data-table";


export type BitCraftToDataDef<T> = {
    columns: ColumnDef<T, any>[];
    facetedFilters?: FilterSetupProps<T>[];
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
            const keys = aKey.split(".");
            let result;
            for (const key of keys) {
                result = result?.[key];
            }
            ret = result;
        } else {
            ret = (obj as any)[aKey];
        }
    }
    return ret ?? def;
}