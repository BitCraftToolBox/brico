/**
 * token-store.ts — the Node stand-in for the browser's `localStorage` connection-token slot.
 *
 * These are credentials. The directory is created 0700 and files 0600; nothing here is ever logged.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

export interface TokenStore {
    read(key: string): string | undefined;
    write(key: string, token: string): void;
}

/** Anything that could escape the state directory or upset a filesystem becomes an underscore. */
function fileNameFor(key: string): string {
    return `${key.replace(/[^a-zA-Z0-9._-]+/g, "_")}.token`;
}

export function createFileTokenStore(dir: string): TokenStore {
    let ensured = false;
    const ensure = () => {
        if (ensured) return;
        mkdirSync(dir, {recursive: true, mode: 0o700});
        ensured = true;
    };

    return {
        read(key) {
            try {
                const token = readFileSync(path.join(dir, fileNameFor(key)), "utf8").trim();
                return token === "" ? undefined : token;
            } catch {
                // No token yet (or an unreadable one) simply means "connect anonymously and store
                // whatever the server issues" — never a reason to fail startup.
                return undefined;
            }
        },
        write(key, token) {
            ensure();
            writeFileSync(path.join(dir, fileNameFor(key)), token, {encoding: "utf8", mode: 0o600});
        },
    };
}
