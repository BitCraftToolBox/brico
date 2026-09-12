import {FilterFn, Row, Table} from "@tanstack/solid-table";
import {type ClassValue, clsx} from "clsx"
import {Accessor, createSignal} from "solid-js";
import {twMerge} from "tailwind-merge"
import {activeDataLocale} from "~/lib/data-translation";
import {compareText, i18n, PSEUDOLOCALE_ENABLED, trackUILocale} from "~/lib/i18n";

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

/**
 * Sort comparator for faceted-filter options: numeric values in numeric order, everything else by
 * its **displayed label**.
 *
 * Comparing labels rather than values matters now that game-text columns keep an English value and
 * translate only for display (see the note at the top of table-utils/column-builders.tsx) —
 * comparing values would alphabetize the option list in English while showing it in another
 * language. `compareText` also collates in the reader's locale rather than the runtime default.
 */
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
    return compareText(a.label, b.label);
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

/**
 * `Intl.DurationFormat` support is recent enough that it's feature-detected rather than assumed —
 * on a runtime without it (older Safari, mainly) this falls back to the original hardcoded-English
 * `h`/`m`/`s` suffixes rather than throwing.
 */
const supportsDurationFormat = typeof (Intl as { DurationFormat?: unknown }).DurationFormat === "function";

let durationFormat: Intl.DurationFormat | undefined;
let durationFormatZero: Intl.DurationFormat | undefined;
let durationFormatLocale: string | undefined;

/** Cached per locale, same reasoning as the `Intl.Collator` cache backing `compareText`. */
function getDurationFormats(locale: string): [Intl.DurationFormat, Intl.DurationFormat] {
    if (!durationFormat || !durationFormatZero || durationFormatLocale !== locale) {
        durationFormatLocale = locale;
        try {
            durationFormat = new Intl.DurationFormat(locale, {style: "narrow"});
            // `secondsDisplay: "always"` only for the all-zero case: DurationFormat omits
            // zero-valued units by default, so a plain zero duration formats to "".
            durationFormatZero = new Intl.DurationFormat(locale, {style: "narrow", secondsDisplay: "always"});
        } catch {
            durationFormat = new Intl.DurationFormat(undefined, {style: "narrow"});
            durationFormatZero = new Intl.DurationFormat(undefined, {style: "narrow", secondsDisplay: "always"});
        }
    }
    return [durationFormat, durationFormatZero];
}

function readableSecondsFallback(hours: number, minutes: number, secs: number): string {
    return [
        hours > 0 ? `${hours}h` : null,
        minutes > 0 ? `${minutes}m` : null,
        secs > 0 ? `${secs}s` : null,
    ].filter(Boolean).join(" ") || "0s";
}

export function readableSeconds(seconds: number | undefined, shorten: boolean = false): string | undefined {
    if (seconds === undefined) return undefined;
    if (seconds === -1) return "-1";
    seconds = Math.round(seconds);
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = hours > 0 && shorten ? 0 : seconds % 60;

    if (!supportsDurationFormat) return readableSecondsFallback(hours, minutes, secs);

    trackUILocale();
    const [fmt, fmtZero] = getDurationFormats(PSEUDOLOCALE_ENABLED ? activeDataLocale() : i18n.locale);
    if (hours === 0 && minutes === 0 && secs === 0) {
        return fmtZero.format({seconds: 0});
    }
    const duration: Partial<Record<Intl.DurationFormatUnit, number>> = {};
    if (hours > 0) duration.hours = hours;
    if (minutes > 0) duration.minutes = minutes;
    if (secs > 0) duration.seconds = secs;
    return fmt.format(duration);
}

export function useCopy(content: string | Accessor<string>, delay: number = 1500): [() => void, Accessor<boolean>] {
    const [contentCopied, setContentCopied] = createSignal(false);
    const copyContent = () => {
        const value = typeof content === "function" ? content() : content;
        if (value) {
            navigator.clipboard.writeText(value).then(() => {
                setContentCopied(true);
                setTimeout(() => setContentCopied(false), delay);
            });
        }
    };
    return [copyContent, contentCopied];
}
