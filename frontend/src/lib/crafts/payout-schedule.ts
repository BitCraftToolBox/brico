/**
 * payout-schedule.ts — the public `stelo_payout_schedule` singleton: when the interval payout sweep
 * last ran and how often it runs. Readable without logging in; absent when the bot has no Stelo config.
 */
import {tables} from "@brico/bindings/brico-app";
import {type Accessor, createMemo, createSignal, onCleanup, untrack} from "solid-js";
import {isServer} from "solid-js/web";
import {type PayoutTime, payoutTime} from "~/lib/crafts/report-math";
import {BRICO_APP_SERVER, bricoAppTable} from "~/lib/spacetime/brico-app";
import {useConnection} from "~/lib/spacetime/manager";

/** The next sweep time, or `undefined` while the schedule row is missing. Re-evaluated once a minute. */
export function createNextPayout(): Accessor<PayoutTime | undefined> {
    const conn = useConnection(BRICO_APP_SERVER);
    const [schedule, setSchedule] = createSignal<{intervalMicros: bigint; lastSweepAtMicros: bigint} | undefined>(undefined, {
        equals: (a, b) => a?.intervalMicros === b?.intervalMicros && a?.lastSweepAtMicros === b?.lastSweepAtMicros,
    });
    const [now, setNow] = createSignal(Date.now());

    function readRows() {
        const row = [...(conn.active()?.db.steloPayoutSchedule.iter() ?? [])][0];
        setSchedule(row ? {intervalMicros: row.intervalMicros, lastSweepAtMicros: row.lastSweepAt.microsSinceUnixEpoch} : undefined);
    }

    if (!isServer) {
        const request = untrack(() => conn.requestResource({key: "stelo-payout-schedule", tables: [bricoAppTable(tables.steloPayoutSchedule)]}, readRows));
        onCleanup(request.release);
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        onCleanup(() => clearInterval(timer));
    }

    return createMemo(() => {
        const current = schedule();
        return current ? payoutTime(current, now()) : undefined;
    });
}
