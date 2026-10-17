/**
 * brico-app.ts — the `spacetimedb@2.x` adapter, bound to brico's own `brico-app` module.
 *
 * Unlike prism, a connection here is normally OIDC-authenticated (SpacetimeAuth) rather than
 * anonymous — see `lib/account/state.tsx`, which seeds the token via `primeToken` before the first
 * dial. Nothing below needs to know that; `withToken` already accepts any bearer token.
 */
import {DbConnection, tables} from "@brico/bindings/brico-app";
import type {AdapterOpenRequest, AdapterSubscription, SdkAdapter} from "~/lib/spacetime/adapter";
import type {ServerDescriptor, TableQuery} from "~/lib/spacetime/connection";
import {PRISM_SERVER} from "~/lib/spacetime/prism";

/** A table reference from the generated query builder — also a whole-table query. */
export type BricoAppTable = (typeof tables)[keyof typeof tables];

/** One query the brico-app adapter accepts: a whole table, a `.where(...)`-narrowed table, or raw SQL. */
export type BricoAppQuery = string | BricoAppTable | ReturnType<BricoAppTable["where"]>;

/** The module's connection object, as `DbConnection.builder().build()` returns it. */
export type BricoAppConnection = InstanceType<typeof DbConnection>;

/** SQL/source table (view) name → the accessor it hangs off `conn.db` under. See `prism.ts`. */
const TABLE_ACCESSORS: ReadonlyMap<string, string> = new Map(
    Object.values(tables as Record<string, {sourceName?: unknown; accessorName?: unknown}>)
        .filter((ref): ref is {sourceName: string; accessorName: string} =>
            typeof ref?.sourceName === "string" && typeof ref?.accessorName === "string")
        .map(ref => [ref.sourceName, ref.accessorName] as const),
);

/** Row callbacks take (ctx, row) or (ctx, oldRow, row); the generic layer needs neither. */
type RowListener = (...args: never[]) => void;

/** The slice of a 2.x table handle the adapter uses. */
interface WatchableTable {
    onInsert: (cb: RowListener) => void;
    onDelete: (cb: RowListener) => void;
    onUpdate: (cb: RowListener) => void;
    removeOnInsert: (cb: RowListener) => void;
    removeOnDelete: (cb: RowListener) => void;
    removeOnUpdate: (cb: RowListener) => void;
}

function describe(event: unknown, fallback: string): string {
    return event ? `${fallback} ${String(event)}` : `${fallback.replace(/:$/, ".")}`;
}

export const bricoAppAdapter: SdkAdapter<BricoAppConnection, BricoAppQuery> = {
    sdk: "spacetimedb@2",

    open(request: AdapterOpenRequest<BricoAppConnection>): BricoAppConnection {
        return DbConnection.builder()
            .withUri(request.uri)
            .withDatabaseName(request.module)
            .withToken(request.token)
            .onConnect((conn, _identity, token) => request.onConnect(conn, token))
            .onDisconnect(ctx => request.onDisconnect(describe(ctx.event, "Disconnected:")))
            .onConnectError(ctx => request.onConnectError(describe(ctx.event, "Connection error:")))
            .build();
    },

    close(connection) {
        connection.disconnect();
    },

    isActive(connection) {
        return connection.isActive;
    },

    subscribe(connection, queries, handlers): AdapterSubscription {
        return connection
            .subscriptionBuilder()
            .onApplied(() => handlers.onApplied())
            .onError(ctx => handlers.onError(describe(ctx.event, "Subscription error:")))
            .subscribe([...queries]);
    },

    watch(connection, tableNames, onChange) {
        const attached: {table: WatchableTable; listener: RowListener}[] = [];
        const view = connection.db as unknown as Record<string, WatchableTable | undefined>;

        for (const name of tableNames) {
            const table = view[TABLE_ACCESSORS.get(name) ?? name];
            if (!table) continue;
            const listener: RowListener = () => onChange();
            table.onInsert(listener);
            table.onDelete(listener);
            table.onUpdate(listener);
            attached.push({table, listener});
        }

        return () => {
            for (const {table, listener} of attached) {
                table.removeOnInsert(listener);
                table.removeOnDelete(listener);
                table.removeOnUpdate(listener);
            }
            attached.length = 0;
        };
    },
};

/**
 * brico's own module — account/identity, linked integrations, saved craft filters/watches, and
 * bounty rules/payouts.
 *
 * Defaults to the same host as prism (deployed alongside it); `brico-app` has no production host
 * of its own yet, so override both `VITE_BRICO_APP_HOST`/`VITE_BRICO_APP_MODULE` via
 * `frontend/.env.local` to point at a local `spacetime start` instance during development.
 */
export const BRICO_APP_SERVER: ServerDescriptor<BricoAppConnection, BricoAppQuery> = {
    uri: import.meta.env.VITE_BRICO_APP_HOST as string ?? PRISM_SERVER.uri,
    module: import.meta.env.VITE_BRICO_APP_MODULE as string ?? "brico-app",
    adapter: bricoAppAdapter,
    tokenNamespace: "brico-app",
};

/** A resource entry subscribing to a whole brico-app table (view). */
export function bricoAppTable(ref: BricoAppTable): TableQuery<BricoAppQuery> {
    return {table: ref.sourceName, query: ref};
}
