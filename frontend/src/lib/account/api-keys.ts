/**
 * api-keys.ts — the profile page's own view of `brico-app`'s `my_api_key`, plus create/delete.
 */
import {tables} from "@brico/bindings/brico-app";
import type {ApiKeyRow} from "@brico/bindings/brico-app/types";
import {type Accessor, createEffect, createSignal, untrack} from "solid-js";
import {useAccount} from "~/lib/account/state";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/** Access flags a key can carry; mirrors the boolean columns of `api_key`. */
export interface ApiKeyAccess {
    readPayouts: boolean;
}

export interface ApiKeysHandle {
    /** The caller's own keys, oldest first. Tokens are never included. */
    keys: Accessor<ApiKeyRow[]>;
    /** Creates a key and resolves to its token, which is not retrievable afterwards. */
    create: (name: string, access: ApiKeyAccess) => Promise<string>;
    remove: (id: bigint) => Promise<void>;
}

export function createApiKeys(): ApiKeysHandle {
    const acc = useAccount();
    const conn = useConnection(BRICO_APP_SERVER);
    const [keys, setKeys] = createSignal<ApiKeyRow[]>([]);

    function readRows() {
        const active = conn.active();
        if (!active) {
            setKeys([]);
            return;
        }
        const rows = [...active.db.myApiKey.iter()] as ApiKeyRow[];
        setKeys(rows.sort((a, b) => Number(a.createdAt.microsSinceUnixEpoch - b.createdAt.microsSinceUnixEpoch)));
    }

    let release: (() => void) | null = null;
    function subscribe() {
        if (release) return;
        // `untrack` is load-bearing — see `~/lib/notifications/state.tsx`'s `subscribe()` doc
        // comment for the exact re-subscribe race this avoids.
        const request = untrack(() =>
            conn.requestResource({key: "api-keys:self", tables: [bricoAppTable(tables.myApiKey)]}, readRows)
        );
        release = request.release;
    }
    function unsubscribe() {
        release?.();
        release = null;
        setKeys([]);
    }

    // `acc.isLoggedIn()` is a `createMemo` at the source, so this only re-runs on the actual
    // boolean flip — see `account/state.tsx`'s doc comment on `account`.
    createEffect(() => {
        if (acc.isLoggedIn()) subscribe(); else unsubscribe();
    });

    async function create(name: string, access: ApiKeyAccess): Promise<string> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        const result = await active.procedures.createApiKey({name, readPayouts: access.readPayouts});
        return result.token;
    }

    async function remove(id: bigint): Promise<void> {
        const active = conn.active();
        if (!active) throw new Error("Not connected.");
        await active.reducers.deleteApiKey({id});
    }

    return {keys, create, remove};
}
