/**
 * currency-policy.ts — the public `stelo_currency_policy` rows: what happens to a payee's escrow-backed
 * money of each currency when they have no wallet to receive it. Absent when the bot has no Stelo config.
 */
import {tables} from "@brico/bindings/brico-app";
import {type Accessor, createSignal, onCleanup, untrack} from "solid-js";
import {isServer} from "solid-js/web";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

export interface CurrencyPolicy {
    action: "rollover" | "refund";
    /** The currency credited to the payee on a rollover. */
    rollTo: string | undefined;
    afterDays: number;
}

/** The published unclaimed-money policy by currency id. */
export function createCurrencyPolicies(): Accessor<ReadonlyMap<string, CurrencyPolicy>> {
    const conn = useConnection(BRICO_APP_SERVER);
    const [policies, setPolicies] = createSignal<ReadonlyMap<string, CurrencyPolicy>>(new Map());

    function readRows() {
        const rows = [...(conn.active()?.db.steloCurrencyPolicy.iter() ?? [])];
        setPolicies(new Map(rows.map(row => [row.currency, {
            action: row.action === "rollover" ? "rollover" : "refund",
            rollTo: row.rollTo,
            afterDays: row.afterDays,
        }])));
    }

    if (!isServer) {
        const request = untrack(() => conn.requestResource({key: "stelo-currency-policy", tables: [bricoAppTable(tables.steloCurrencyPolicy)]}, readRows));
        onCleanup(request.release);
    }
    return policies;
}
