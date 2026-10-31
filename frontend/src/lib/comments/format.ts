/** format.ts — the composer toolbar's text edits, as pure functions over a string and a selection. */

export type FormatKind = "bold" | "italic" | "strike" | "code" | "quote" | "list" | "numbered" | "link";

export interface Edit {
    text: string;
    selectionStart: number;
    selectionEnd: number;
}

const WRAP: Record<"bold" | "italic" | "strike" | "code", { marker: string; placeholder: string }> = {
    bold: {marker: "**", placeholder: "bold text"},
    italic: {marker: "*", placeholder: "italic text"},
    strike: {marker: "~~", placeholder: "struck text"},
    code: {marker: "`", placeholder: "code"},
};

const PREFIX: Record<"quote" | "list", string> = {quote: "> ", list: "- "};

const NUMBER_PREFIX = /^\d+\. /;

function wrap(text: string, start: number, end: number, marker: string, placeholder: string): Edit {
    const before = text.slice(0, start);
    const after = text.slice(end);
    if (start === end) {
        return {text: `${before}${marker}${placeholder}${marker}${after}`, selectionStart: start + marker.length, selectionEnd: start + marker.length + placeholder.length};
    }
    // Selection already inside the markers: take them off instead of nesting.
    if (before.endsWith(marker) && after.startsWith(marker)) {
        return {text: before.slice(0, -marker.length) + text.slice(start, end) + after.slice(marker.length), selectionStart: start - marker.length, selectionEnd: end - marker.length};
    }
    return {text: `${before}${marker}${text.slice(start, end)}${marker}${after}`, selectionStart: start + marker.length, selectionEnd: end + marker.length};
}

/** Prefixes every line the selection touches, or removes the prefix when they all have it. */
function prefixLines(text: string, start: number, end: number, prefix: string): Edit {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = text.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const remove = lines.every(line => line.startsWith(prefix));
    const edited = lines.map(line => remove ? line.slice(prefix.length) : prefix + line).join("\n");
    return {text: text.slice(0, lineStart) + edited + text.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + edited.length};
}

/** Numbers every line the selection touches from 1, or strips the numbers when they all have one. */
function numberLines(text: string, start: number, end: number): Edit {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = text.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const remove = lines.every(line => NUMBER_PREFIX.test(line));
    const edited = lines.map((line, i) => remove ? line.replace(NUMBER_PREFIX, "") : `${i + 1}. ${line}`).join("\n");
    return {text: text.slice(0, lineStart) + edited + text.slice(lineEnd), selectionStart: lineStart, selectionEnd: lineStart + edited.length};
}

function link(text: string, start: number, end: number): Edit {
    const label = start === end ? "link text" : text.slice(start, end);
    const url = "https://";
    const inserted = `[${label}](${url})`;
    const urlStart = start + label.length + 3;
    return {text: text.slice(0, start) + inserted + text.slice(end), selectionStart: urlStart, selectionEnd: urlStart + url.length};
}

/** Replaces the selection `[start, end)` with `inserted` and puts the caret after it. */
export function insertText(text: string, start: number, end: number, inserted: string): Edit {
    const caret = start + inserted.length;
    return {text: text.slice(0, start) + inserted + text.slice(end), selectionStart: caret, selectionEnd: caret};
}

/** Applies a toolbar action to `text` with the selection `[start, end)`. */
export function applyFormat(text: string, start: number, end: number, kind: FormatKind): Edit {
    switch (kind) {
        case "bold":
        case "italic":
        case "strike":
        case "code":
            return wrap(text, start, end, WRAP[kind].marker, WRAP[kind].placeholder);
        case "quote":
        case "list":
            return prefixLines(text, start, end, PREFIX[kind]);
        case "numbered":
            return numberLines(text, start, end);
        case "link":
            return link(text, start, end);
    }
}
