/**
 * log.ts — a deliberately tiny leveled logger.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = {debug: 10, info: 20, warn: 30, error: 40};

export interface Logger {
    debug(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
    /** A child logger whose scope is `<parent>.<name>`. */
    child(name: string): Logger;
}

function renderFields(fields: Record<string, unknown> | undefined): string {
    if (!fields) return "";
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        // bigint has no JSON encoding and entity ids are the most common field here, so render
        // scalars directly and only fall back to JSON for structures.
        const rendered = typeof value === "object" && value !== null ? JSON.stringify(value, jsonSafe) : String(value);
        parts.push(`${key}=${rendered}`);
    }
    return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function jsonSafe(_key: string, value: unknown): unknown {
    return typeof value === "bigint" ? value.toString() : value;
}

export function createLogger(minLevel: LogLevel, scope = "bot"): Logger {
    const threshold = ORDER[minLevel];

    function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
        if (ORDER[level] < threshold) return;
        const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${renderFields(fields)}`;
        if (level === "error" || level === "warn") console.error(line);
        else console.log(line);
    }

    return {
        debug: (message, fields) => emit("debug", message, fields),
        info: (message, fields) => emit("info", message, fields),
        warn: (message, fields) => emit("warn", message, fields),
        error: (message, fields) => emit("error", message, fields),
        child: name => createLogger(minLevel, `${scope}.${name}`),
    };
}
