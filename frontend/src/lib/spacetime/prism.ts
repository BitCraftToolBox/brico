/**
 * prism.ts — the `spacetimedb@2.x` adapter, bound to prism's relay module.
 */
import {DbConnection, tables} from "@brico/bindings/prism";
import type {AdapterOpenRequest, AdapterSubscription, SdkAdapter} from "~/lib/spacetime/adapter";
import type {ServerDescriptor, TableQuery} from "~/lib/spacetime/connection";

/** A table reference from the generated query builder — also a whole-table query. */
export type PrismTable = (typeof tables)[keyof typeof tables];

/**
 * One query the prism adapter accepts: a whole table, a `.where(...)`-narrowed table, or raw SQL.
 *
 * Derived from the generated `tables` object rather than written out, so it tracks regeneration.
 */
export type PrismQuery = string | PrismTable | ReturnType<PrismTable["where" | "leftSemijoin"]>;

/** The relay's connection object, as `DbConnection.builder().build()` returns it. */
export type PrismConnection = InstanceType<typeof DbConnection>;

/**
 * SQL/source table name → the accessor it hangs off `conn.db` under.
 *
 * Read off the generated schema instead of being spelled out: the 2.x generator renames tables to
 * camelCase on the client and keeps the snake_case spelling only as a deprecated alias it says it
 * will drop, so hardcoding either spelling would break on a regeneration.
 */
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

/** Turns an SDK error context into something a status line can show. */
function describe(event: unknown, fallback: string): string {
    return event ? `${fallback} ${String(event)}` : `${fallback.replace(/:$/, ".")}`;
}

export const prismAdapter: SdkAdapter<PrismConnection, PrismQuery> = {
    sdk: "spacetimedb@2",

    open(request: AdapterOpenRequest<PrismConnection>): PrismConnection {
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
 * prism's relay module — the live mirror of BitCraft's crafting/claim data.
 *
 * `VITE_RELAY_HOST`/`VITE_RELAY_MODULE` point this at a local relay for development.
 *
 * The token namespace stays `prism` so credentials issued before the connection layer was
 * generalized keep working — the localStorage key is byte-identical to the one `createCraftRelay`
 * used to build inline.
 */
export const PRISM_SERVER: ServerDescriptor<PrismConnection, PrismQuery> = {
    uri: import.meta.env.VITE_RELAY_HOST as string ?? "https://st.prism.brico.app",
    module: import.meta.env.VITE_RELAY_MODULE as string ?? "prism-relay",
    adapter: prismAdapter,
    tokenNamespace: "prism",
};

/** A resource entry subscribing to a whole prism table. */
export function prismTable(ref: PrismTable): TableQuery<PrismQuery> {
    return {table: ref.sourceName, query: ref};
}

/**
 * A resource entry subscribing to part of a prism table.
 *
 * The table is still named separately from the query because row listeners attach by table while
 * the query only narrows which rows arrive — a `.where(...)` result carries no name the generic
 * layer could recover.
 */
export function prismRows(ref: PrismTable, query: PrismQuery): TableQuery<PrismQuery> {
    return {table: ref.sourceName, query};
}
